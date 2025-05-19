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
import { adminDb, db } from "init.js";
import askRepeatedly from "functions/askRepeatedly.js";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import { checkDateValidity, daysFrom, toSnakeCase } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import findEmoji from "helpers/findEmoji.js";
import moderateContent from "@/functions/moderateContent.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import getUserInfo from "@/functions/getUserInfo.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import { validParts } from "@/data/other.js";
import getUsersImages from "@/functions/getUserImages.js";
import getLatestTasks from "@/functions/getLatestTasks.js";
import { checkIfPublic } from "./checkIfPublic.js";
import createRoutineData from "@/functions/createRoutineData.js";

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
      returnTasks,
      returnRoutine,
      selectedDestinationRoutine,
    } = req.body;

    const { isValidDate, isFutureDate } = checkDateValidity(
      startDate,
      req.timeZone
    );

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
        error: "short",
      });
      return;
    }

    if (description.length > 300 || instruction.length > 300) {
      res.status(200).json({
        error: "long",
      });
      return;
    }

    try {
      const userImages = await getUsersImages({
        userId: req.userId,
        part,
      });

      if (!userImages) {
        res.status(200).json({
          error: "scan",
        });
        return;
      }

      const text = `Description: ${description}.<-->Instruction: ${instruction}.`;

      const { isSafe } = await moderateContent({
        content: [{ type: "text", text }],
      });

      if (!isSafe) {
        res.status(200).json({
          error: `inappropriate`,
        });
        return;
      }

      const { hasIntentOfHarmOrDefamation, explanation } =
        await isActivityHarmful({
          userId: req.userId,
          categoryName: CategoryNameEnum.TASKS,
          text,
        });

      if (hasIntentOfHarmOrDefamation) {
        await doWithRetries(async () =>
          adminDb.collection("HarmfulTaskDescriptions").insertOne({
            userId: new ObjectId(req.userId),
            response: explanation,
            type: "save",
            text,
          })
        );
        res.status(200).json({
          error: "violates",
        });
        return;
      }

      const relevantRoutine = selectedDestinationRoutine
        ? await doWithRetries(async () =>
            db
              .collection("Routine")
              .findOne({ _id: new ObjectId(selectedDestinationRoutine) })
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
        restDays: z
          .number()
          .describe(
            "Number of days the user should rest before repeating this activity"
          ),
        isDish: z
          .boolean()
          .describe(
            "true if this activity is a dish that has to be prepared before eating"
          ),
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

      const color = generateRandomPastelColor();

      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { name: 1 },
      });

      const productTypes = response.productTypes.filter((s: string) => s);

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
        productTypes,
        requiresProof: productTypes.length > 0,
      };

      if (generalTaskInfo.requiresProof) {
        generalTaskInfo.requisite =
          "Take a picture or record a video of the product you have used.";
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
      const finalStartDate =
        new Date(startDate) > latestDateOfWeeek ? latestDateOfWeeek : startDate;

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
          startsAt: starts,
          expiresAt: expires,
          completedAt: null,
        });
      }

      let { concerns, allTasks, createdAt } = relevantRoutine || {
        concerns: [],
        allTasks: [],
        createdAt: null,
      };

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

        await doWithRetries(async () =>
          db.collection("Routine").insertOne(routinePayload)
        );

        const routineDataPromises = routinePayload.concerns.map((concern) =>
          createRoutineData({
            part,
            concern,
            userId: new ObjectId(routinePayload.userId),
            userName: routinePayload.userName,
          })
        );

        await Promise.all(routineDataPromises);
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

      const reponse = { tasks: [], routine: null };

      if (returnRoutine) {
        reponse.routine = await doWithRetries(() =>
          db.collection("Routine").find({ _id: routineId }).next()
        );
      }

      if (returnTasks) {
        reponse.tasks = await getLatestTasks({
          userId: req.userId,
          timeZone: req.timeZone,
        });
      }

      res.status(200).json({ message: reponse });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
