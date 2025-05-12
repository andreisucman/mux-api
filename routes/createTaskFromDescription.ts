import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { z } from "zod";
import { Router, Response, NextFunction } from "express";
import { zodResponseFormat } from "openai/helpers/zod";
import { CategoryNameEnum, CustomRequest } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import doWithRetries from "helpers/doWithRetries.js";
import { adminDb } from "init.js";
import getUsersImages from "@/functions/getUserImages.js";
import { validParts } from "@/data/other.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { name, part, concern } = req.body;

  if (!name || !validParts.includes(part)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    /* check if scanned */
    const relatedImage = await getUsersImages({ userId: req.userId, part });

    if (!relatedImage) {
      res.status(200).json({
        error: `You need to scan your ${part} first.`,
      });
      return;
    }

    const { hasIntentOfHarmOrDefamation, explanation } = await isActivityHarmful({
      text: name,
      userId: req.userId,
      categoryName: CategoryNameEnum.TASKS,
    });

    if (hasIntentOfHarmOrDefamation) {
      await doWithRetries(async () =>
        adminDb.collection("HarmfulTaskDescriptions").insertOne({
          userId: new ObjectId(req.userId),
          response: explanation,
          text: name,
          type: "create",
        })
      );
      res.status(200).json({
        error: "This task violates our ToS or is too dangerous for general use.",
      });
      return;
    }

    const systemContent = `The user gives you the name of an activity. Your goal is to create a task based on this info.
    Here is what you should to:
    1. Create a 1-sentence description for the activity that tells what it is and why it is important for the user (up to 300 characters).
    2. Create a concise (up to 300 characters) step-by-step instruction for the activity where each step is on a new line (separated by \n).`;

    const TaskType = z.object({
      description: z.string(),
      instruction: z.string(),
    });

    const runs = [
      {
        content: [
          {
            type: "text",
            text: `Activity name: ${name}`,
          },
          {
            type: "text",
            text: `Concern targeted: ${concern}. Relevant part of the body: ${part}.`,
          },
        ],
        model: "ft:gpt-4o-mini-2024-07-18:personal:create-task-from-description:BWQpM6ui",
        responseFormat: zodResponseFormat(TaskType, "task"),
      },
    ];

    const response = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId: req.userId,
      categoryName: CategoryNameEnum.TASKS,
      functionName: "createTaskFromDescription",
    });

    res.status(200).json({ message: response });
  } catch (err) {
    next(err);
  }
});

export default route;
