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
import filterRelevantProductTypes from "@/functions/filterRelevantTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import moderateContent from "@/functions/moderateContent.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import getUserInfo from "@/functions/getUserInfo.js";
import findEmbeddings from "@/functions/findEmbeddings.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import { validParts } from "@/data/other.js";

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
          error: `This task violates our ToS.`,
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

      const latestRelevantRoutine = await doWithRetries(async () =>
        db.collection("Routine").findOne({
          userId: new ObjectId(req.userId),
          status: RoutineStatusEnum.ACTIVE,
          part,
        })
      );

      const systemContent = `The user gives you the description and instruction of an activity and a list of concerns. Your goal is to create a task based on this info.`;

      const TaskResponseType = z.object({
        name: z.string().describe("The name of the task in an imperative form"),
        word: z
          .string()
          .describe(
            "A single word based on the description that can be userd for the closest node-emoji search (e.g. tomato, potato, shoe, weights... etc. )"
          ),
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
            'An array of product types needed to complete this activity (example: ["olive oil","tomato"] )'
          ),
      });

      const runs = [
        {
          isMini: false,
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

      const { word, ...otherResponse } = response || {};

      const color = generateRandomPastelColor();
      const image = await generateImage({
        description,
        userId: req.userId,
        categoryName: CategoryNameEnum.TASKS,
      });

      const generalTaskInfo: TaskType = {
        ...otherResponse,
        userId: new ObjectId(req.userId),
        example: { type: "image", url: image },
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

      const relevantSolutions = await findEmbeddings({
        index: "solution_search",
        projection: { productTypes: 1, icon: 1, suggestions: 1 },
        embedding,
        collection: "Solution",
        relatednessScore: 0.85,
      });

      if (relevantSolutions.length > 0) {
        const filteredProductTypes = await filterRelevantProductTypes({
          userId: req.userId,
          info,
          categoryName: CategoryNameEnum.TASKS,
          productTypes: relevantSolutions.map((s) => s.prouductTypes),
        });

        generalTaskInfo.productTypes = filteredProductTypes;

        if (filteredProductTypes.length > 0) {
          const relevantSuggestionObjects = relevantSolutions.filter(
            (solution) =>
              solution.productTypes.some((productType: string) =>
                filteredProductTypes.includes(productType)
              )
          );

          const relevantSuggestions = relevantSuggestionObjects
            .flatMap((obj) => obj.suggestions)
            .filter((suggestionObject) =>
              filteredProductTypes.includes(suggestionObject?.suggestion)
            );

          generalTaskInfo.suggestions = relevantSuggestions;
        }
      }

      const moderatedFrequency = Math.min(frequency, 70);

      const distanceInDays = Math.round(Math.max(7 / moderatedFrequency, 1));

      let draftTasks: TaskType[] = [];

      const latestDateOfWeeek = daysFrom({ days: 7 });
      const finalStartDate =
        new Date(startDate) > latestDateOfWeeek ? latestDateOfWeeek : startDate;

      const icon =
        relevantSolutions?.[0]?.icon || (await findEmoji(word)) || "🚩";

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

      let { concerns = [], allTasks = [], createdAt } = latestRelevantRoutine;
      let finalSchedule: { [key: string]: ScheduleTaskType[] } =
        latestRelevantRoutine.finalSchedule || {};

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
        total: moderatedFrequency,
        description,
        instruction,
        completed: 0,
        unknown: 0,
      });

      await incrementProgress({
        operationKey: "routine",
        userId: req.userId,
        value: 20,
      });

      const { minDate, maxDate } = getMinAndMaxRoutineDates(allTasks);

      const routinePayload: Partial<RoutineType> = {
        ...latestRelevantRoutine,
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

      if (latestRelevantRoutine) {
        draftTasks = draftTasks.map((t) => ({
          ...t,
          routineId: new ObjectId(latestRelevantRoutine._id),
        }));

        await doWithRetries(async () =>
          db.collection("Routine").updateOne(
            { _id: new ObjectId(latestRelevantRoutine._id), part },
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
        keyTwo: "manuallyTasksCreated",
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
