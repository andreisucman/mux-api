import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, RoutineType, TaskStatusEnum, TaskType } from "types.js";
import { daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import getLatestRoutinesAndTasks from "@/functions/getLatestRoutineAndTasks.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId } = req.body;

    try {
      const currentTask = (await doWithRetries(async () =>
        db
          .collection("Task")
          .findOne({ _id: new ObjectId(taskId) }, { projection: { _id: 0 } })
      )) as unknown as TaskType;

      const { routineId } = currentTask;

      const currentRoutine = (await doWithRetries(async () =>
        db.collection("Routine").findOne({ _id: new ObjectId(routineId) })
      )) as unknown as RoutineType;

      if (!currentRoutine) throw httpError(`Routine ${routineId} not found`);

      const { allTasks, finalSchedule, lastDate } = currentRoutine || {};

      const relevantAllTask = allTasks.find((r) => r.key === currentTask.key);

      const interval = Math.floor(7 / relevantAllTask.ids.length);

      const newStartsAt = daysFrom({
        date: new Date(currentTask.startsAt),
        days: Math.max(1, interval),
      });

      const newExpiresAt = daysFrom({
        date: new Date(newStartsAt),
        days: 1,
      });

      const resetTask = {
        ...currentTask,
        startsAt: newStartsAt,
        expiresAt: newExpiresAt,
        isSubmitted: false,
        status: TaskStatusEnum.ACTIVE,
      };

      await doWithRetries(async () =>
        db.collection("Task").insertOne(resetTask)
      );

      let updatedSchedule = { ...finalSchedule };
      const dateKey = newStartsAt.toDateString();

      const newFinalScheduleRecord = {
        key: resetTask.key,
        _id: resetTask._id,
        concern: resetTask.concern,
      };

      if (updatedSchedule[dateKey]) {
        updatedSchedule[dateKey] = [
          ...updatedSchedule[dateKey],
          newFinalScheduleRecord,
        ];
      } else {
        updatedSchedule[dateKey] = [newFinalScheduleRecord];
      }

      const newAllTaskRecord = {
        ids: [
          {
            _id: resetTask._id,
            startsAt: newStartsAt,
            status: TaskStatusEnum.ACTIVE,
          },
        ],
        name: resetTask.name,
        icon: resetTask.icon,
        color: resetTask.color,
        key: resetTask.key,
        concern: resetTask.concern,
        description: resetTask.description,
        instruction: resetTask.instruction,
        total: 1,
        completed: 0,
        unknown: 0,
      };

      const finalRoutineAllTasks = combineAllTasks({
        oldAllTasks: allTasks,
        newAllTasks: [newAllTaskRecord],
      });

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: routineId },
          {
            $set: {
              finalSchedule: updatedSchedule,
              allTasks: finalRoutineAllTasks,
              lastDate: newStartsAt > lastDate ? newStartsAt : lastDate,
            },
          }
        )
      );

      const response = await getLatestRoutinesAndTasks({
        userId: req.userId,
        filter: { type: currentTask.type },
        returnOnlyRoutines: true,
      });

      res.status(200).json({
        message: response,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
