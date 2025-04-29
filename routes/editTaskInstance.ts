import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CategoryNameEnum, CustomRequest, TaskStatusEnum, TaskType } from "types.js";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkIfTaskIsSimilar from "@/functions/checkIfTaskIsSimilar.js";
import moderateContent from "@/functions/moderateContent.js";
import httpError from "@/helpers/httpError.js";
import { adminDb, db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskId, updatedDescription, updatedInstruction, applyToAll, returnRoutine } = req.body;

  if (!updatedDescription && !updatedInstruction) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  if (!ObjectId.isValid(taskId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const relevantTask = (await doWithRetries(async () =>
      db.collection("Task").findOne(
        { _id: new ObjectId(taskId) },
        {
          projection: {
            name: 1,
            icon: 1,
            color: 1,
            key: 1,
            concern: 1,
            description: 1,
            instruction: 1,
            routineId: 1,
            startsAt: 1,
          },
        }
      )
    )) as unknown as TaskType;

    if (!relevantTask) throw httpError(`Task ${taskId} not found`);

    if (updatedDescription || updatedInstruction) {
      const text = `Description: ${updatedDescription}.<-->Instruction: ${updatedInstruction}.`;

      const { isSafe } = await moderateContent({
        content: [{ type: "text", text }],
      });

      if (!isSafe) {
        res.status(200).json({
          error: `Your text seems to contain inappropriate language. Please try again.`,
        });
        return;
      }

      const { hasIntentOfHarmOrDefamation, explanation } = await isActivityHarmful({
        userId: req.userId,
        categoryName: CategoryNameEnum.TASKS,
        text,
      });

      if (hasIntentOfHarmOrDefamation) {
        await doWithRetries(async () =>
          adminDb.collection("HarmfulTaskDescriptions").insertOne({
            userId: new ObjectId(req.userId),
            response: explanation,
            type: "edit",
            text,
          })
        );
        res.status(200).json({
          error: `This task violates our ToS.`,
        });
        return;
      }

      const isSimilar = await checkIfTaskIsSimilar({
        userId: req.userId,
        description: relevantTask.description,
        instruction: relevantTask.instruction,
        categoryName: CategoryNameEnum.TASKS,
        newDescription: updatedDescription,
        newInstruction: updatedInstruction,
      });

      if (!isSimilar) {
        const reply = "You can't change the task entirely. If you need to make a new task use the plus button.";
        res.status(200).json({ error: reply });
        return;
      }
    }

    const updateTaskPayload = {
      completedAt: null as Date | null,
      description: updatedDescription,
      instruction: updatedInstruction,
    };

    if (applyToAll) {
      await doWithRetries(async () =>
        db.collection("Task").updateMany(
          {
            key: relevantTask.key,
            status: TaskStatusEnum.ACTIVE,
          },
          {
            $set: {
              description: updatedDescription || relevantTask.description,
              instruction: updatedInstruction || relevantTask.instruction,
            },
          }
        )
      );
    } else {
      await doWithRetries(async () =>
        db.collection("Task").updateOne({ _id: new ObjectId(taskId) }, { $set: updateTaskPayload })
      );
    }

    if (returnRoutine) {
      const routine = await doWithRetries(async () =>
        db.collection("Routine").findOne({ _id: new ObjectId(relevantTask.routineId) })
      );
      res.status(200).json({ message: routine });
      return;
    }

    res.status(200).end();
  } catch (err) {
    next(err);
  }
});

export default route;
