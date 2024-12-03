import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { z } from "zod";
import { Router, Response, NextFunction } from "express";
import { zodResponseFormat } from "openai/helpers/zod";
import { CustomRequest, NextActionType } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import moderateText from "functions/moderateText.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkIfTaskIsRelated from "@/functions/checkIfTaskIsRelated.js";
import { daysFrom } from "helpers/utils.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { description, type, timeZone = "America/New_York" } = req.body;

    if (!description || !type) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      /* check if scanned */
      const userInfo = (await doWithRetries({
        functionName: "saveTaskFromDescription - get created tasks",
        functionToExecute: async () =>
          db.collection("User").findOne(
            {
              _id: new ObjectId(req.userId),
            },
            { projection: { nextScan: 1 } }
          ),
      })) as unknown as { nextScan: NextActionType };

      const finalType = type === "head" ? type : "body";

      const relevantScanType = userInfo.nextScan.find(
        (obj) => obj.type === finalType
      );
      if (new Date() >= new Date(relevantScanType.date)) {
        res.status(200).json({
          error: "You need to scan yourself first.",
        });
        return;
      }

      /* count created tasks */
      const lastWeekStart = daysFrom({
        date: setUtcMidnight({
          date: new Date(),
          timeZone,
        }),
        days: -7,
      });

      const tasksCount = await doWithRetries({
        functionName: "saveTaskFromDescription - get created tasks",
        functionToExecute: async () =>
          db.collection("Task").countDocuments({
            isCreated: true,
            startsAt: { $gte: lastWeekStart },
          }),
      });

      if (tasksCount > 70) {
        res.status(200).json({
          error: "You can create only 70 tasks per week. Try again tomorrow.",
        });
        return;
      }

      const { isHarmful, explanation } = await moderateText({
        text: description,
        userId: req.userId,
      });

      if (isHarmful) {
        await doWithRetries({
          functionName: "createTaskFromDescription route - add harmful record",
          functionToExecute: async () =>
            db.collection("HarmfulTaskDescriptions").insertOne({
              userId: new ObjectId(req.userId),
              response: explanation,
              text: description,
              type: "create",
            }),
        });
        res.status(200).json({
          error: `This task violates our ToS.`,
        });
        return;
      }

      const { satisfies, condition } = await checkIfTaskIsRelated({
        userId: req.userId,
        text: description,
        type,
      });

      if (!satisfies) {
        res.status(200).json({ error: condition });
        return;
      }

      const systemContent = `The user gives you the description of an activity. Your goal is to create a task based on this info.
    Here is what you should to:
    1. Create a 2-3 sentence description for the activity that tells what it is and why it is important.
    2. Create a concise step-by-step instruction for the activity where each step is on a new line (separated by \n).`;

      const TaskType = z.object({
        description: z.string(),
        instruction: z.string(),
      });

      const runs = [
        {
          isMini: false,
          content: [
            {
              type: "text",
              text: `Activity description: ${description}`,
            },
          ],
          model:
            "ft:gpt-4o-mini-2024-07-18:personal:create-task-from-description:AHtZHgUJ",
          responseFormat: zodResponseFormat(TaskType, "task"),
        },
      ];

      const response = await askRepeatedly({
        systemContent: systemContent,
        runs: runs as RunType[],
        userId: req.userId,
      });

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
