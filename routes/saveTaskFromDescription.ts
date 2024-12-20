import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";
import { ObjectId } from "mongodb";
import { generateRandomPastelColor } from "make-random-color";
import { Router, Response, NextFunction } from "express";
import { zodResponseFormat } from "openai/helpers/zod";
import { RunType } from "@/types/askOpenaiTypes.js";
import {
  CustomRequest,
  RoutineStatusEnum,
  RoutineType,
  TaskType,
} from "types.js";
import { db } from "init.js";
import askRepeatedly from "functions/askRepeatedly.js";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import findRelevantSolutions from "functions/findRelevantSolutions.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import distributeSubmissions from "@/helpers/distributeSubmissions.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import { daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import createTextEmbedding from "functions/createTextEmbedding.js";
import checkIfTaskIsRelated from "functions/checkIfTaskIsRelated.js";
import findEmoji from "helpers/findEmoji.js";
import generateImage from "functions/generateImage.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import filterRelevantProductTypes from "@/functions/filterRelevantTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import moderateContent from "@/functions/moderateContent.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const {
      sex,
      type,
      description,
      instruction,
      startDate,
      frequency,
      timeZone = "America/New_York",
    } = req.body;

    if (
      !description ||
      !instruction ||
      !startDate ||
      !frequency ||
      !sex ||
      !type
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const text = `Description: ${description}.<-->Instruction: ${instruction}.`;

      const isSafe = await moderateContent({
        content: [{ type: "text", text }],
      });

      if (!isSafe) {
        res.status(200).json({
          error: `Your text contains inappropriate language. Please try again.`,
        });
        return;
      }

      const { isHarmful, explanation } = await isActivityHarmful({
        userId: req.userId,
        text,
      });

      if (isHarmful) {
        await doWithRetries(async () =>
          db.collection("HarmfulTaskDescriptions").insertOne({
            userId: new ObjectId(req.userId),
            response: explanation,
            type: "create",
            text,
          })
        );
        res.status(200).json({
          error: `This task violates our ToS.`,
        });
        return;
      }

      const { satisfies, condition } = await checkIfTaskIsRelated({
        userId: req.userId,
        text,
        type,
      });

      if (!satisfies) {
        res.status(200).json({ error: condition });
        return;
      }

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: type },
          {
            $set: { isRunning: true, progress: 1 },
            $unset: { isError: "" },
          },
          { upsert: true }
        )
      );

      res.status(200).end();

      const listOfRelevantConcerns = await doWithRetries(async () =>
        db
          .collection("Concern")
          .find(
            {
              types: { $in: [type] },
              $or: [{ sex }, { sex: "all" }],
            },
            { projection: { key: 1 } }
          )
          .toArray()
      );

      const latestRelevantRoutine = (await doWithRetries(async () =>
        db
          .collection("Routine")
          .findOne({ userId: new ObjectId(req.userId), type, status: "active" })
      )) || { _id: new ObjectId() };

      const systemContent = `The user gives you the description and instruction of an activity and a list of concerns. Your goal is to create a task based on this info.
    Here is what you should to:
    1. Come up with a short name for the task in imperative form.
    2. Come up with one word from node-emoji that best suits the task.
    3. Choose one the most relevant concern for the task from the list of concerns provided.
    4. Choose all related concerns for the task from the list of concerns provided.
    5. Describe what requisite the user has to provide to prove the completion of the activity.
    6. How many days the user should rest before repeating this activity?
    7. Which part of the body the task is related to the most?`;

      const TaskType = z.object({
        name: z.string(),
        concern: z.string(),
        nearestConcerns: z.array(z.string()),
        word: z.string(),
        requisite: z.string(),
        restDays: z.number(),
        part: z.enum(["face", "mouth", "scalp", "body", "health"]),
      });

      const runs = [
        {
          isMini: false,
          content: [
            {
              type: "text",
              text: `Activity description: ${description}.<-->Activity instruction: ${instruction}.<-->List of concerns: ${JSON.stringify(
                listOfRelevantConcerns.map((obj) => obj.name)
              )}`,
            },
          ],
          model:
            "ft:gpt-4o-mini-2024-07-18:personal:save-task-from-description:AIx7makF",
          responseFormat: zodResponseFormat(TaskType, "task"),
        },
      ];

      const response = await askRepeatedly({
        systemContent: systemContent,
        runs: runs as RunType[],
        userId: req.userId,
        functionName: "saveTaskFromDescription",
      });

      await incrementProgress({
        operationKey: type,
        userId: req.userId,
        increment: 10,
      });

      const { word, ...otherResponse } = response || {};

      const color = generateRandomPastelColor();
      const image = await generateImage({ description, userId: req.userId });

      const generalTaskInfo: TaskType = {
        ...otherResponse,
        userId: new ObjectId(req.userId),
        routineId: new ObjectId(latestRelevantRoutine._id),
        example: { type: "image", url: image },
        productsPersonalized: false,
        proofEnabled: true,
        status: "active",
        key: otherResponse.name.toLowerCase(),
        description,
        instruction,
        isCreated: true,
        color,
        type,
        revisionDate: daysFrom({ date: otherResponse.startsAt, days: 30 }),
      };

      const info = `${description}.${instruction}`;
      const embedding = await createTextEmbedding({
        userId: req.userId,
        text: info,
      });

      await incrementProgress({
        operationKey: type,
        userId: req.userId,
        increment: 25,
      });
      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: type },
          {
            $inc: { progress: 25 },
          }
        )
      );

      const relevantSolutions = await findRelevantSolutions(embedding);

      if (relevantSolutions.length > 0) {
        const filteredProductTypes = await filterRelevantProductTypes({
          userId: req.userId,
          info,
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

          const relevantDefaultSuggestions = relevantSuggestionObjects
            .flatMap((obj) => obj.defaultSuggestions)
            .filter((suggestionObject) =>
              filteredProductTypes.includes(suggestionObject?.suggestion)
            );

          generalTaskInfo.suggestions = relevantSuggestions;
          generalTaskInfo.defaultSuggestions = relevantDefaultSuggestions;
        }
      }

      const moderatedFrequency = Math.min(frequency, 70);

      const submissions = distributeSubmissions(
        moderatedFrequency,
        7,
        generalTaskInfo.name
      );

      const distanceInDays = Math.round(Math.max(7 / moderatedFrequency, 1));

      const draftTasks: TaskType[] = [];

      const latestDateOfWeeek = daysFrom({ days: 6 });
      const finalStartDate =
        new Date(startDate) > latestDateOfWeeek ? latestDateOfWeeek : startDate;

      const icon = relevantSolutions?.[0]?.icon || findEmoji(word) || "🙌";

      generalTaskInfo.icon = icon;

      for (let i = 0; i < Math.min(moderatedFrequency, 7); i++) {
        const starts = daysFrom({
          date: setUtcMidnight({
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
          startsAt: starts,
          expiresAt: expires,
          requiredSubmissions: submissions[i],
        });
      }

      let {
        finalSchedule = {},
        concerns = [],
        allTasks = [],
        createdAt,
      } = latestRelevantRoutine;

      /* update final schedule */
      for (let i = 0; i < draftTasks.length; i++) {
        const task = draftTasks[i];
        const dateString = new Date(task.startsAt).toDateString();

        const simpleTaskContent = {
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
      allTasks.push({
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

      const dates = Object.keys(finalSchedule);
      const lastRoutineDate = dates[dates.length - 1];

      await incrementProgress({
        operationKey: type,
        userId: req.userId,
        increment: 20,
      });

      const payload: Partial<RoutineType> = {
        ...latestRelevantRoutine,
        userId: new ObjectId(req.userId),
        type,
        concerns,
        allTasks,
        finalSchedule,
        status: "active" as RoutineStatusEnum,
        lastDate: new Date(lastRoutineDate),
      };

      if (!createdAt) {
        payload.createdAt = new Date();
      }

      await incrementProgress({
        operationKey: type,
        userId: req.userId,
        increment: 15,
      });

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(latestRelevantRoutine._id) },
          {
            $set: payload,
          },
          { upsert: true }
        )
      );

      await doWithRetries(async () =>
        db.collection("Task").insertMany(draftTasks)
      );

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: type },
          {
            $set: { isRunning: false, progress: 0 },
            $unset: { isError: "" },
          }
        )
      );
    } catch (err) {
      await addAnalysisStatusError({
        userId: req.userId,
        message:
          "An unexpected error occured. Please try again and inform us if the error persists.",
        originalMessage: err.message,
        operationKey: type,
      });
      next(err);
    }
  }
);

export default route;
