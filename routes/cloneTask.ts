import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, RoutineType, TaskStatusEnum, TaskType } from "types.js";
import { checkDateValidity, daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import getLatestRoutinesAndTasks from "@/functions/getLatestRoutineAndTasks.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import { db } from "init.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, startDate, resetNewTask, returnTask } = req.body;

    const { isValidDate, isFutureDate } = checkDateValidity(startDate);

    if (!isValidDate || !isFutureDate || !ObjectId.isValid(taskId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

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

      const newStartsAt = new Date(startDate);

      const newExpiresAt = daysFrom({
        date: new Date(startDate),
        days: 1,
      });

      const newRevisionDate =
        currentTask.revisionDate > new Date()
          ? currentTask.revisionDate
          : daysFrom({ days: 7 });

      const newNextCanStartDate = daysFrom({
        date: newExpiresAt,
        days: currentTask.restDays,
      });

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

      if (resetNewTask) resetTask.recipe = null;

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

      const { minDate, maxDate } =
        getMinAndMaxRoutineDates(finalRoutineAllTasks);

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: routineId },
          {
            $set: {
              finalSchedule: updatedSchedule,
              allTasks: finalRoutineAllTasks,
              lastDate: new Date(maxDate),
              startsAt: new Date(minDate),
            },
          }
        )
      );

      let result: { [key: string]: any } = {};

      const routinesFilter = {
        part: currentTask.part,
        status: { $in: ["active", "replaced"] },
      };

      const { routines } = await getLatestRoutinesAndTasks({
        userId: req.userId,
        filter: routinesFilter,
        returnOnlyRoutines: true,
      });

      if (routines.length > 0) result.routine = routines[0];
      if (returnTask) result.newTask = resetTask;

      res.status(200).json({
        message: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
