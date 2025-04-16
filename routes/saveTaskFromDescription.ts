import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";
import { ObjectId } from "mongodb";
import { generateRandomPastelColor } from "make-random-color";
import { Router, Response, NextFunction } from "express";
import { zodResponseFormat } from "openai/helpers/zod";
import { RunType } from "@/types/askOpenaiTypes.js";
import { CategoryNameEnum, CustomRequest, RoutineStatusEnum, RoutineType, TaskStatusEnum, TaskType } from "types.js";
import { adminDb, db } from "init.js";
import askRepeatedly from "functions/askRepeatedly.js";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import { checkDateValidity, daysFrom, toSnakeCase } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import findEmoji from "helpers/findEmoji.js";
import moderateContent from "@/functions/moderateContent.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import getUserInfo from "@/functions/getUserInfo.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import { validParts } from "@/data/other.js";
import getUsersImages from "@/functions/getUserImages.js";
import generateImage from "@/functions/generateImage.js";
import searchYoutubeVideos from "@/functions/searchYoutubeVideos.js";
import getLatestTasks from "@/functions/getLatestTasks.js";
import { checkIfPublic } from "./checkIfPublic.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const {
    part,
    concern,
    description,
    instruction,
    startDate,
    frequency,
    exampleVideoId,
    returnTasks,
    returnRoutine,
    selectedDestinationRoutine,
  } = req.body;

  const { isValidDate, isFutureDate } = checkDateValidity(startDate, req.timeZone);

  if (
    !description ||
    !instruction ||
    !frequency ||
    !concern ||
    !part ||
    !validParts.includes(part) ||
    !isValidDate ||
    !isFutureDate
  ) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  if (description.length < 50 || instruction.length < 50) {
    res.status(200).json({
      error: "Make your description and instruction at least 50 characters long.",
    });
  }
  try {
    const userImages = await getUsersImages({
      userId: req.userId,
      part,
    });

    if (!userImages) {
      res.status(200).json({
        error: `You need to scan your ${part} first.`,
      });
      return;
    }

    const text = `Description: ${description}.<-->Instruction: ${instruction}.`;

    const { isSafe } = await moderateContent({
      content: [{ type: "text", text }],
    });

    if (!isSafe) {
      res.status(200).json({
        error: `Your text seems to contain inappropriate language. Please try again.`,
      });
      return;
    }

    const { isHarmful, explanation } = await isActivityHarmful({
      userId: req.userId,
      categoryName: CategoryNameEnum.TASKS,
      text,
    });

    if (isHarmful) {
      await doWithRetries(async () =>
        adminDb.collection("HarmfulTaskDescriptions").insertOne({
          userId: new ObjectId(req.userId),
          response: explanation,
          type: "save",
          text,
        })
      );
      res.status(200).json({
        error: "This task violates our ToS. Please modify your description or instruction and try again.",
      });
      return;
    }

    const relevantRoutine = selectedDestinationRoutine
      ? await doWithRetries(async () =>
          db.collection("Routine").findOne({ _id: new ObjectId(selectedDestinationRoutine) })
        )
      : undefined;

    const systemContent = `The user gives you the description and instruction of an activity and a list of concerns. Your goal is to create a task based on this info. If no products are needed to complete this task return an empty array for productTypes.`;

    const productTypesSchema = z.union([
      z
        .array(z.string().describe("name of a product or empty string"))
        .describe(
          'An array of product types that are required for completing this task in singular form or empty string if not products are required (example: ["olive oil","tomato","onion",...]).'
        ),
      z.null(),
    ]);

    const TaskResponseType = z.object({
      name: z.string().describe("The name of the task in an imperative form"),
      requisite: z.string().describe("The requisite that the user has to provide to prove the completion of the task"),
      restDays: z.number().describe("Number of days the user should rest before repeating this activity"),
      isDish: z.boolean().describe("true if this activity is a dish that has to be prepared before eating"),
      isFood: z.boolean().describe("true if this activity is a food"),
      productTypes: productTypesSchema,
    });

    const runs: RunType[] = [
      {
        content: [
          {
            type: "text",
            text: `Activity description: ${description}.<-->Activity instruction: ${instruction}.`,
          },
        ],
        model: "ft:gpt-4o-mini-2024-07-18:personal:save-task-from-description:AIx7makF",
        responseFormat: zodResponseFormat(TaskResponseType, "TaskResponseType"),
      },
    ];

    const response = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId: req.userId,
      categoryName: CategoryNameEnum.TASKS,
      functionName: "saveTaskFromDescription",
    });

    const color = generateRandomPastelColor();

    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { name: 1 },
    });

    const generalTaskInfo: TaskType = {
      ...response,
      userId: new ObjectId(req.userId),
      proofEnabled: true,
      status: TaskStatusEnum.ACTIVE,
      key: toSnakeCase(response.name),
      description,
      instruction,
      userName: userInfo.name,
      isCreated: true,
      color,
      part,
      concern,
      nearestConcerns: [concern],
      examples: [],
      productTypes: response.productTypes.filter((s: string) => s),
    };

    if (response.isFood) {
      const image = await generateImage({
        categoryName: CategoryNameEnum.TASKS,
        description,
        userId: req.userId,
      });
      generalTaskInfo.examples = [{ type: "image", url: image }];
    } else if (exampleVideoId) {
      generalTaskInfo.examples = [
        {
          type: "video",
          url: `https://www.youtube.com/embed/${exampleVideoId}`,
        },
      ];
    } else {
      const relatedYoutubeVideos = await searchYoutubeVideos(generalTaskInfo.name);

      generalTaskInfo.examples = relatedYoutubeVideos.map((url) => ({
        type: "video",
        url,
      }));
    }

    const iconsMap = await findEmoji({
      userId: req.userId,
      taskNames: [generalTaskInfo.name],
    });

    generalTaskInfo.icon = iconsMap[generalTaskInfo.name];

    const moderatedFrequency = Math.min(frequency, 70);

    const distanceInDays = Math.round(Math.max(7 / moderatedFrequency, 1));

    let draftTasks: TaskType[] = [];

    const latestDateOfWeeek = daysFrom({ days: 7 });
    const finalStartDate = new Date(startDate) > latestDateOfWeeek ? latestDateOfWeeek : startDate;

    for (let i = 0; i < Math.min(moderatedFrequency, 7); i++) {
      const starts = daysFrom({
        date: setToMidnight({
          date: new Date(finalStartDate),
          timeZone: req.timeZone,
        }),
        days: distanceInDays * i,
      });

      const expires = daysFrom({
        date: new Date(starts),
        days: 1,
      });

      draftTasks.push({
        ...generalTaskInfo,
        _id: new ObjectId(),
        // embedding,
        startsAt: starts,
        expiresAt: expires,
        completedAt: null,
      });
    }

    let { concerns, allTasks, createdAt, finalSchedule } = relevantRoutine || {
      concerns: [],
      allTasks: [],
      createdAt: null,
      finalSchedule: {},
    };

    for (let i = 0; i < draftTasks.length; i++) {
      const task = draftTasks[i];
      const dateString = new Date(task.startsAt).toDateString();

      const simpleTaskContent: ScheduleTaskType = {
        key: task.key,
        concern: task.concern,
      };

      if (finalSchedule[dateString]) {
        finalSchedule[dateString].push(simpleTaskContent);
      } else {
        finalSchedule[dateString] = [simpleTaskContent];
      }
    }

    finalSchedule = sortTasksInScheduleByDate(finalSchedule);

    /* update concerns */
    const concernExists = concerns.includes(generalTaskInfo.concern);

    if (!concernExists) {
      concerns.push(generalTaskInfo.concern);
    }

    /* update all tasks */
    const ids = draftTasks.map((t) => ({
      _id: t._id,
      startsAt: new Date(t.startsAt),
      status: TaskStatusEnum.ACTIVE,
    }));

    allTasks.push({
      ids,
      name: generalTaskInfo.name,
      icon: generalTaskInfo.icon,
      color: generalTaskInfo.color,
      key: generalTaskInfo.key,
      concern: generalTaskInfo.concern,
      description,
      instruction,
    });

    const { minDate, maxDate } = getMinAndMaxRoutineDates(allTasks);

    const isPublicResponse = await checkIfPublic({
      userId: String(req.userId),
      concerns: [concern],
    });

    const routinePayload: RoutineType = {
      ...relevantRoutine,
      userId: new ObjectId(req.userId),
      concerns,
      part,
      allTasks,
      finalSchedule,
      createdAt: createdAt || new Date(),
      startsAt: new Date(minDate),
      lastDate: new Date(maxDate),
      status: RoutineStatusEnum.ACTIVE,
      isPublic: isPublicResponse.isPublic,
    };

    if (userInfo.name) {
      routinePayload.userName = userInfo.name;
    }

    let routineId;

    if (relevantRoutine) {
      routineId = relevantRoutine._id;

      draftTasks = draftTasks.map((t) => ({
        ...t,
        routineId: new ObjectId(routineId),
      }));

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(routineId), userId: new ObjectId(req.userId) },
          {
            $set: routinePayload,
          }
        )
      );
    } else {
      routineId = new ObjectId();

      draftTasks = draftTasks.map((t) => ({
        ...t,
        routineId,
      }));

      routinePayload._id = routineId;

      await doWithRetries(async () => db.collection("Routine").insertOne(routinePayload));
    }

    if (draftTasks.length > 0) await doWithRetries(async () => db.collection("Task").insertMany(draftTasks));

    updateTasksAnalytics({
      userId: req.userId,
      tasksToInsert: draftTasks,
      keyOne: "tasksCreated",
      keyTwo: "manualTasksCreated",
    });

    await doWithRetries(async () =>
      db.collection("AnalysisStatus").updateOne(
        { userId: new ObjectId(req.userId), operationKey: "routine" },
        {
          $set: { isRunning: false, progress: 0 },
          $unset: { isError: "" },
        }
      )
    );

    const reponse = { tasks: [], routine: null };

    if (returnRoutine) {
      reponse.routine = await doWithRetries(() => db.collection("Routine").find({ _id: routineId }).next());
    }

    if (returnTasks) {
      reponse.tasks = await getLatestTasks({ userId: req.userId, timeZone: req.timeZone });
    }

    res.status(200).json({ message: reponse });
  } catch (err) {
    next(err);
  }
});

export default route;
