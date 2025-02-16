import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import {
  AllTaskTypeWithIds,
  CategoryNameEnum,
  CustomRequest,
  RoutineType,
  TaskStatusEnum,
  TaskType,
} from "types.js";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import formatDate from "@/helpers/formatDate.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import { daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkIfTaskIsSimilar from "@/functions/checkIfTaskIsSimilar.js";
import moderateContent from "@/functions/moderateContent.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

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

    if (!updatedDescription && !updatedInstruction && !startDate && !timeZone) {
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
          const reply =
            "Task can't be changed entirely. If you need to make a new task use the plus button.";
          res.status(200).json({ error: reply });
          return;
        }
      }

      const newStartsAt = setToMidnight({
        date: new Date(startDate),
        timeZone,
      });

      const latestDateOfWeeek = daysFrom({ days: 7 });

      const newExpires = daysFrom({
        date: new Date(newStartsAt),
        days: 1,
      });

      const updateTaskPayload = {
        startsAt: newStartsAt,
        expiresAt:
          newExpires > latestDateOfWeeek ? latestDateOfWeeek : newExpires,
        completedAt: null as Date | null,
        description: updatedDescription,
        instruction: updatedInstruction,
      };

      const relevantRoutine = (await doWithRetries(async () =>
        db
          .collection("Routine")
          .findOne(
            { _id: new ObjectId(relevantTask.routineId) },
            { projection: { finalSchedule: 1, allTasks: 1 } }
          )
      )) as unknown as RoutineType;

      let finalSchedule: { [key: string]: ScheduleTaskType[] } =
        relevantRoutine.finalSchedule || {};

      const oldDateKey = relevantTask.startsAt.toDateString();
      const newDateKey = newStartsAt.toDateString();

      if (finalSchedule[oldDateKey] && oldDateKey !== newDateKey) {
        finalSchedule[newDateKey] = [...finalSchedule[oldDateKey]];
        delete finalSchedule[oldDateKey];
      }

      finalSchedule = sortTasksInScheduleByDate(finalSchedule);

      const dates = Object.keys(finalSchedule);
      const lastRoutineDate = dates[dates.length - 1];

      const relevantAllTask: AllTaskTypeWithIds = relevantRoutine.allTasks.find(
        (t: AllTaskTypeWithIds) => t.key === relevantTask.key
      );

      const newAllTaskId = {
        _id: relevantTask._id,
        startsAt: newStartsAt,
        status: TaskStatusEnum.ACTIVE,
      };

      const newAllTaskIds = relevantAllTask.ids.map((idObj) =>
        String(idObj._id) === String(relevantTask._id) ? newAllTaskId : idObj
      );

      const newAllTaskRecord = {
        ...relevantAllTask,
        ids: newAllTaskIds,
        description: updatedDescription || relevantTask.description,
        instruction: updatedInstruction || relevantTask.instruction,
      };

      const newAllTasks = relevantRoutine.allTasks.map((atObj) =>
        atObj.key === newAllTaskRecord.key ? newAllTaskRecord : atObj
      );

      await doWithRetries(async () =>
        db
          .collection("Task")
          .updateOne({ _id: new ObjectId(taskId) }, { $set: updateTaskPayload })
      );

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(relevantTask.routineId) },
          {
            $set: {
              finalSchedule,
              allTasks: newAllTasks,
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
