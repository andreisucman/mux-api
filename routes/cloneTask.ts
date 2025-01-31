import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, RoutineType, TaskStatusEnum, TaskType } from "types.js";
import { daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import getLatestRoutinesAndTasks from "@/functions/getLatestRoutineAndTasks.js";
import { db } from "init.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, startingDate, returnRoutinesWithStatus, returnTask } =
      req.body;

    try {
      const currentTask = (await doWithRetries(async () =>
        db
          .collection("Task")
          .findOne({ _id: new ObjectId(taskId) }, { projection: { _id: 0 } })
      )) as unknown as TaskType;

      const { routineId } = currentTask;

      const currentRoutine = (await doWithRetries(async () =>
        db.collection("Routine").findOne(
          { _id: new ObjectId(routineId), userId: new ObjectId(req.userId) },
          {
            projection: {
              allTasks: 1,
              finalSchedule: 1,
              lastDate: 1,
              status: 1,
            },
          }
        )
      )) as unknown as RoutineType;

      if (!currentRoutine) throw httpError(`Routine ${routineId} not found`);

      const { allTasks, finalSchedule, lastDate, status } =
        currentRoutine || {};

      if (!["active", "replaced"].includes(status)) {
        res.status(200).json({ error: `Can't edit an inactive routine` });
        return;
      }

      const relevantAllTask = allTasks.find((r) => r.key === currentTask.key);

      const interval = Math.floor(7 / relevantAllTask.ids.length);

      const sanitizedStartingDate = startingDate
        ? new Date(startingDate) >= new Date()
          ? new Date(startingDate)
          : null
        : null;

      const newStartsAt = sanitizedStartingDate
        ? sanitizedStartingDate
        : daysFrom({
            date: new Date(currentTask.startsAt),
            days: Math.max(1, interval),
          });

      const newExpiresAt = daysFrom({
        date: new Date(newStartsAt),
        days: 1,
      });

      const newRevisionDate =
        currentTask.revisionDate > new Date()
          ? currentTask.revisionDate
          : daysFrom({ days: 7 });

      const newNextCanStartDate = daysFrom({ days: currentTask.restDays });

      const resetTask: TaskType = {
        ...currentTask,
        startsAt: newStartsAt,
        expiresAt: newExpiresAt,
        isSubmitted: false,
        proofId: null,
        completedAt: null,
        nextCanStartDate: newNextCanStartDate,
        revisionDate: newRevisionDate,
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

      updatedSchedule = sortTasksInScheduleByDate(updatedSchedule);

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

      let result: { [key: string]: any } = {};

      if (returnRoutinesWithStatus) {
        const finalRoutineStatus =
          returnRoutinesWithStatus === "replaced"
            ? { $in: ["active", "replaced"] }
            : returnRoutinesWithStatus;

        const routinesFilter = {
          type: currentTask.type,
          status: finalRoutineStatus,
        };

        if (finalRoutineStatus) routinesFilter.status = finalRoutineStatus;

        const response = await getLatestRoutinesAndTasks({
          userId: req.userId,
          filter: routinesFilter,
          returnOnlyRoutines: true,
        });

        result = { ...response };
      }

      if (returnTask) {
        result.newTask = resetTask;
      }

      res.status(200).json({
        message: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
