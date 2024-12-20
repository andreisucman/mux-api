import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { z } from "zod";
import { Router, Response, NextFunction } from "express";
import { zodResponseFormat } from "openai/helpers/zod";
import { CustomRequest } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkIfTaskIsRelated from "@/functions/checkIfTaskIsRelated.js";
import { daysFrom } from "helpers/utils.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import { db } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";

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
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { nextScan: 1 },
      });

      const finalType = type === "head" ? type : "body";

      const relevantScanType = userInfo.nextScan.find(
        (obj) => obj.type === finalType
      );

      if (new Date() >= new Date(relevantScanType.date)) {
        res.status(200).json({
          error: `You need to scan your ${finalType} first.`,
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

      const tasksCount = await doWithRetries(async () =>
        db.collection("Task").countDocuments({
          isCreated: true,
          startsAt: { $gte: lastWeekStart },
        })
      );

      if (tasksCount > 70) {
        res.status(200).json({
          error: "You can create only 70 tasks per week. Try again tomorrow.",
        });
        return;
      }

      const { isHarmful, explanation } = await isActivityHarmful({
        text: description,
        userId: req.userId,
      });

      if (isHarmful) {
        await doWithRetries(async () =>
          db.collection("HarmfulTaskDescriptions").insertOne({
            userId: new ObjectId(req.userId),
            response: explanation,
            text: description,
            type: "create",
          })
        );
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
        let error;
        switch (type) {
          case "head":
            error = `You can only create head improvement tasks in the Head mode. To create other type of tasks change the mode to Body or Health.`;
            break;
          case "head":
            error = `You can only create body improvement tasks in the Body mode. To create other type of tasks change the mode to Head or Health.`;
            break;
          case "health":
            error = `You can only create food and health related tasks in the Health mode. To create other type of tasks change the mode to Head or Body.`;
            break;
        }
        res.status(200).json({ error });
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
        functionName: "createTaskFromDescription",
      });

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
