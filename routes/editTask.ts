import * as dotenv from "dotenv";
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import moderateText from "functions/moderateText.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import formatDate from "@/helpers/formatDate.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import { daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkTaskSimilar from "functions/checkTaskSimilar.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

dotenv.config();

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const {
      taskId,
      updatedDescription,
      updatedInstruction,
      startDate,
      timeZone,
    } = req.body;

    if (!updatedDescription || !updatedInstruction || !startDate || !timeZone) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const text = `Description: ${updatedDescription}.<-->Instruction: ${updatedInstruction}.`;

      const { isHarmful, explanation } = await moderateText({
        userId: req.userId,
        text,
      });

      if (isHarmful) {
        await doWithRetries(async () =>
          db.collection("HarmfulTaskDescriptions").insertOne({
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

      const currentTask = await doWithRetries(async () =>
        db.collection("Task").findOne(
          { _id: new ObjectId(taskId) },
          {
            projection: {
              description: 1,
              instruction: 1,
              routineId: 1,
              startsAt: 1,
            },
          }
        )
      );

      if (!currentTask) throw httpError(`Task ${taskId} not found`);

      const { description, instruction, routineId, startsAt } = currentTask;

      const isSimilar = await checkTaskSimilar({
        userId: req.userId,
        description,
        instruction,
        newDescription: updatedDescription,
        newInstruction: updatedInstruction,
      });

      if (!isSimilar) {
        const reply =
          "Task can't be changed entirely. If you need a new task use the plus button.";
        res.status(200).json({ error: reply });
        return;
      }

      const newStarts = setUtcMidnight({
        date: new Date(startDate),
        timeZone,
      });

      const latestDateOfWeeek = daysFrom({ days: 6 });

      const newExpires = daysFrom({
        date: new Date(newStarts),
        days: 1,
      });

      const updateTask = {
        startsAt: newStarts,
        expiresAt:
          newExpires > latestDateOfWeeek ? latestDateOfWeeek : newExpires,
        description: updatedDescription,
        instruction: updatedInstruction,
      };

      await doWithRetries(async () =>
        db
          .collection("Task")
          .updateOne({ _id: new ObjectId(taskId) }, { $set: updateTask })
      );

      const relevantRoutine = await doWithRetries(async () =>
        db
          .collection("Routine")
          .findOne(
            { _id: new ObjectId(routineId) },
            { projection: { finalSchedule: 1 } }
          )
      );

      let { finalSchedule } = relevantRoutine;

      const oldDateKey = formatDate({ date: startsAt });
      const newDateKey = formatDate({ date: startDate });

      if (finalSchedule[oldDateKey] && oldDateKey !== newDateKey) {
        finalSchedule[newDateKey] = [...finalSchedule[oldDateKey]];
        finalSchedule[oldDateKey] = null;
      }

      finalSchedule = sortTasksInScheduleByDate(finalSchedule);

      const dates = Object.keys(finalSchedule);
      const lastRoutineDate = dates[dates.length - 1];

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(routineId) },
          {
            $set: {
              finalSchedule,
              lastDate: new Date(lastRoutineDate),
            },
          }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
