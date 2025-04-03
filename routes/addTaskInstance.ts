import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import {
  CustomRequest,
  RoutineStatusEnum,
  RoutineType,
  TaskStatusEnum,
  TaskType,
} from "types.js";
import { checkDateValidity, daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, startDate, timeZone, returnTask } = req.body;

    const { isValidDate, isFutureDate } = checkDateValidity(
      startDate,
      timeZone
    );

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

      const { routineId: taskRoutineId } = currentTask || {};
      const projection = {
        allTasks: 1,
        finalSchedule: 1,
        lastDate: 1,
        status: 1,
      };

      let relevantRoutine = (await doWithRetries(async () =>
        db.collection("Routine").findOne(
          {
            _id: taskRoutineId,
            userId: new ObjectId(req.userId),
            status: RoutineStatusEnum.ACTIVE,
          },
          {
            projection,
          }
        )
      )) as unknown as RoutineType;

      if (!relevantRoutine) {
        relevantRoutine = (await doWithRetries(async () =>
          db
            .collection("Routine")
            .find(
              {
                part: currentTask.part,
                userId: new ObjectId(req.userId),
                status: RoutineStatusEnum.ACTIVE,
              },
              {
                projection,
              }
            )
            .sort({ startsAt: 1 })
            .next()
        )) as unknown as RoutineType;
      }

      if (!relevantRoutine) throw httpError(`Routine not found`);

      const {
        _id: routineId,
        allTasks,
        finalSchedule,
        status,
      } = relevantRoutine || {};

      if (status !== RoutineStatusEnum.ACTIVE) {
        res.status(200).json({ error: `Can't edit an inactive routine` });
        return;
      }

      const newStartsAt = setToMidnight({
        date: new Date(startDate),
        timeZone,
      });

      const newExpiresAt = daysFrom({
        date: new Date(newStartsAt),
        days: 1,
      });

      const newNextCanStartDate = daysFrom({
        date: newExpiresAt,
        days: currentTask.restDays,
      });

      const resetTask: TaskType = {
        ...currentTask,
        startsAt: newStartsAt,
        expiresAt: newExpiresAt,
        proofId: null,
        completedAt: null,
        nextCanStartDate: newNextCanStartDate,
        status: TaskStatusEnum.ACTIVE,
      };

      if (resetTask.recipe) {
        resetTask.recipe = {
          ...resetTask.recipe,
          canPersonalize: true,
        };
      }

      await doWithRetries(async () =>
        db.collection("Task").insertOne(resetTask)
      );

      let updatedSchedule = { ...(finalSchedule || {}) };
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

      const updatedRoutine = await doWithRetries(() =>
        db.collection("Routine").findOne({ _id: new ObjectId(routineId) })
      );

      if (updatedRoutine) result.routine = updatedRoutine;
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
