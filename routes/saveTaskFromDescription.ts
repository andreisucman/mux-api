import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";
import { ObjectId } from "mongodb";
import { generateRandomPastelColor } from "make-random-color";
import { Router, Response, NextFunction } from "express";
import { zodResponseFormat } from "openai/helpers/zod";
import { RunType } from "@/types/askOpenaiTypes.js";
import {
  CategoryNameEnum,
  CustomRequest,
  RoutineStatusEnum,
  RoutineType,
  TaskStatusEnum,
  TaskType,
} from "types.js";
import { db } from "init.js";
import askRepeatedly from "functions/askRepeatedly.js";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import { checkDateValidity, daysFrom, toSnakeCase } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import createTextEmbedding from "functions/createTextEmbedding.js";
import findEmoji from "helpers/findEmoji.js";
import generateImage from "functions/generateImage.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import moderateContent from "@/functions/moderateContent.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import getUserInfo from "@/functions/getUserInfo.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import { validParts } from "@/data/other.js";
import findRelevantSuggestions from "@/functions/findRelevantSuggestions.js";
import searchYoutubeVideo from "@/functions/searchYoutubeVideo.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const {
      part,
      concern,
      description,
      instruction,
      startDate,
      frequency,
      timeZone = "America/New_York",
    } = req.body;

    const { isValidDate, isFutureDate } = checkDateValidity(startDate);

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

    try {
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
          db.collection("HarmfulTaskDescriptions").insertOne({
            userId: new ObjectId(req.userId),
            response: explanation,
            type: "save",
            text,
          })
        );
        res.status(200).json({
          error:
            "This task violates our ToS or is too dangerous for general use.",
        });
        return;
      }

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: "routine" },
          {
            $set: { isRunning: true, progress: 1 },
            $unset: { isError: "" },
          },
          { upsert: true }
        )
      );

      res.status(200).end();

      const todayMidnight = setToMidnight({
        date: new Date(startDate),
        timeZone,
      });

      const relevantRoutine = await doWithRetries(async () =>
        db.collection("Routine").findOne({
          userId: new ObjectId(req.userId),
          status: RoutineStatusEnum.ACTIVE,
          part,
          $and: [
            { startsAt: { $gte: todayMidnight } },
            { startsAt: { $lt: daysFrom({ date: todayMidnight, days: 7 }) } },
          ],
        })
      );

      const systemContent = `The user gives you the description and instruction of an activity and a list of concerns. Your goal is to create a task based on this info.`;

      const TaskResponseType = z.object({
        name: z.string().describe("The name of the task in an imperative form"),
        icon: z
          .string()
          .describe(
            "The closest unicode icon from node-emoji for this activity based on description and instructon"
          ),
        // words: z
        //   .array(z.string())
        //   .describe(
        //     "An array of up to 10 most contextually meaningfull node-emoji keywords based on the task's info."
        //   ),
        requisite: z
          .string()
          .describe(
            "The requisite that the user has to provide to prove the completion of the task"
          ),
        restDays: z
          .number()
          .describe(
            "Number of days the user should rest before repeating this activity"
          ),
        productTypes: z
          .array(z.string())
          .describe(
            'An array of unique in their purpose product types in singular form (example: ["olive oil","tomato","onion"]). If multiple similar product types can be used, pick one - the most relevant.'
          ),
      });

      const runs: RunType[] = [
        {
          content: [
            {
              type: "text",
              text: `Activity description: ${description}.<-->Activity instruction: ${instruction}.`,
            },
          ],
          model:
            "ft:gpt-4o-mini-2024-07-18:personal:save-task-from-description:AIx7makF",
          responseFormat: zodResponseFormat(
            TaskResponseType,
            "TaskResponseType"
          ),
        },
      ];

      const response = await askRepeatedly({
        systemContent: systemContent,
        runs: runs as RunType[],
        userId: req.userId,
        categoryName: CategoryNameEnum.TASKS,
        functionName: "saveTaskFromDescription",
      });

      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { name: 1 },
      });

      await incrementProgress({
        operationKey: "routine",
        userId: req.userId,
        value: 10,
      });

      const { words, ...otherResponse } = response || {};

      const color = generateRandomPastelColor();

      const generalTaskInfo: TaskType = {
        ...otherResponse,
        userId: new ObjectId(req.userId),
        proofEnabled: true,
        status: TaskStatusEnum.ACTIVE,
        key: toSnakeCase(otherResponse.name),
        description,
        instruction,
        userName: userInfo.name,
        isCreated: true,
        color,
        part,
        concern,
        nearestConcerns: [concern],
      };

      const youtubeVideo = await searchYoutubeVideo(
        `How to ${generalTaskInfo.name}`
      );

      if (youtubeVideo) {
        generalTaskInfo.example = { type: "video", url: youtubeVideo };
      } else {
        const image = await generateImage({
          description,
          userId: req.userId,
          categoryName: CategoryNameEnum.TASKS,
        });
        generalTaskInfo.example = { type: "image", url: image };
      }

      const suggestions = await findRelevantSuggestions(
        generalTaskInfo.productTypes
      );

      generalTaskInfo.suggestions = suggestions;

      const info = `${description}.${instruction}`;
      const embedding = await createTextEmbedding({
        userId: req.userId,
        text: info,
        dimensions: 1536,
        categoryName: CategoryNameEnum.TASKS,
      });

      await incrementProgress({
        operationKey: "routine",
        userId: req.userId,
        value: 25,
      });

      const moderatedFrequency = Math.min(frequency, 70);

      const distanceInDays = Math.round(Math.max(7 / moderatedFrequency, 1));

      let draftTasks: TaskType[] = [];

      const latestDateOfWeeek = daysFrom({ days: 7 });
      const finalStartDate =
        new Date(startDate) > latestDateOfWeeek ? latestDateOfWeeek : startDate;

      const icon = await findEmoji(words);

      generalTaskInfo.icon = icon;

      for (let i = 0; i < Math.min(moderatedFrequency, 7); i++) {
        const starts = daysFrom({
          date: setToMidnight({
            date: new Date(finalStartDate),
            timeZone,
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
          embedding,
          startsAt: starts,
          expiresAt: expires,
          completedAt: null,
        });
      }

      let { concerns = [], allTasks = [], createdAt } = relevantRoutine;
      let finalSchedule: { [key: string]: ScheduleTaskType[] } =
        relevantRoutine.finalSchedule || {};

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
      const concernExists = concerns.find(
        (obj: { name: string }) => obj.name === generalTaskInfo.concern
      );

      if (!concernExists) {
        concerns.push({ name: generalTaskInfo.concern, isDisabled: false });
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

      await incrementProgress({
        operationKey: "routine",
        userId: req.userId,
        value: 20,
      });

      const { minDate, maxDate } = getMinAndMaxRoutineDates(allTasks);

      const routinePayload: Partial<RoutineType> = {
        ...relevantRoutine,
        userId: new ObjectId(req.userId),
        concerns,
        allTasks,
        finalSchedule,
        startsAt: new Date(minDate),
        lastDate: new Date(maxDate),
        status: RoutineStatusEnum.ACTIVE,
      };

      if (userInfo.name) {
        routinePayload.userName = userInfo.name;
      }

      if (!createdAt) {
        routinePayload.createdAt = new Date();
      }

      await incrementProgress({
        operationKey: "routine",
        userId: req.userId,
        value: 15,
      });

      if (relevantRoutine) {
        draftTasks = draftTasks.map((t) => ({
          ...t,
          routineId: new ObjectId(relevantRoutine._id),
        }));

        await doWithRetries(async () =>
          db.collection("Routine").updateOne(
            { _id: new ObjectId(relevantRoutine._id) },
            {
              $set: routinePayload,
            }
          )
        );
      } else {
        const newRoutineId = new ObjectId();

        draftTasks = draftTasks.map((t) => ({
          ...t,
          routineId: newRoutineId,
        }));

        routinePayload._id = newRoutineId;

        await doWithRetries(async () =>
          db.collection("Routine").insertOne(routinePayload)
        );
      }

      if (draftTasks.length > 0)
        await doWithRetries(async () =>
          db.collection("Task").insertMany(draftTasks)
        );

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
    } catch (err) {
      await addAnalysisStatusError({
        userId: req.userId,
        message: "An unexpected error occured. Please try again.",
        originalMessage: err.message,
        operationKey: "routine",
      });
      next(err);
    }
  }
);

export default route;
