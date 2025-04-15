import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import { calculateDaysDifference, checkDateValidity, daysFrom } from "helpers/utils.js";
import sortTasksInScheduleByDate from "helpers/sortTasksInScheduleByDate.js";
import { CustomRequest, RoutineStatusEnum, RoutineType, TaskType } from "types.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import { addTaskToSchedule, removeTaskFromAllTasks, removeTaskFromSchedule } from "@/helpers/rescheduleTaskHelpers.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskKey, currentRoutineId, targetRoutineId, startDate } = req.body;

  const { isValidDate, isFutureDate } = checkDateValidity(startDate, req.timeZone);

  if (!taskKey || !currentRoutineId || !isValidDate || !isFutureDate) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { timeZone: 1, name: 1 },
    });

    if (!userInfo) throw httpError(`User ${req.userId} not found`);

    let taskInfo = (await doWithRetries(async () =>
      db
        .collection("Task")
        .find({ routineId: new ObjectId(currentRoutineId), key: taskKey, userId: new ObjectId(req.userId) })
        .sort({ expiresAt: 1 })
        .next()
    )) as unknown as TaskType;

    if (!taskInfo) throw httpError(`Task ${taskKey} not found.`);

    const hostRoutine = (await doWithRetries(async () =>
      db
        .collection("Routine")
        .findOne(
          { _id: new ObjectId(currentRoutineId), userId: new ObjectId(req.userId) },
          { projection: { allTasks: 1, finalSchedule: 1 } }
        )
    )) as unknown as RoutineType;

    if (!hostRoutine) throw httpError(`${currentRoutineId} routine not found.`);

    const { allTasks: hostAllTasks, finalSchedule: hostFinalSchedule } = hostRoutine;

    const relevantAllTask = hostAllTasks.find((allTask) => allTask.key === taskKey);

    const earliestTask = relevantAllTask.ids.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0];

    const differenceInDays = calculateDaysDifference(
      earliestTask.startsAt,
      setToMidnight({ date: startDate, timeZone: req.timeZone })
    );

    const updatedAllTask = {
      ...relevantAllTask,
      ids: relevantAllTask.ids.map((obj) => ({
        ...obj,
        startsAt: daysFrom({ date: obj.startsAt, days: differenceInDays }),
      })),
    };

    const hostAllTasksWithoutTask = removeTaskFromAllTasks(taskKey, hostAllTasks);
    const hostScheduleWithoutTask = removeTaskFromSchedule(taskKey, hostFinalSchedule);
    const { minDate: minHostDate, maxDate: maxHostDate } = getMinAndMaxRoutineDates(hostAllTasksWithoutTask);

    if (hostAllTasksWithoutTask.length === 0) {
      await doWithRetries(async () =>
        db
          .collection("Routine")
          .updateOne(
            { _id: new ObjectId(currentRoutineId), userId: new ObjectId(req.userId) },
            { $set: { deletedOn: new Date() } }
          )
      );
    } else {
      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(currentRoutineId), userId: new ObjectId(req.userId) },
          {
            $set: {
              allTasks: hostAllTasksWithoutTask,
              finalSchedule: hostScheduleWithoutTask,
              startsAt: new Date(minHostDate),
              lastDate: new Date(maxHostDate),
            },
          }
        )
      );
    }

    const targetRoutineFilter = targetRoutineId
      ? { _id: new ObjectId(targetRoutineId) }
      : {
          userId: new ObjectId(req.userId),
          part: taskInfo.part,
          status: RoutineStatusEnum.ACTIVE,
          startsAt: { $lte: new Date(startDate) },
          lastDate: { $gte: new Date(startDate) },
          deletedOn: { $exists: false },
        };

    let targetRoutine = (await doWithRetries(async () =>
      db.collection("Routine").find(targetRoutineFilter).sort({ startsAt: 1 }).next()
    )) as unknown as RoutineType;

    let {
      concerns: currentConcerns,
      allTasks: currentAllTasks,
      finalSchedule: currentFinalSchedule,
    } = targetRoutine || {};

    let targetSchedule = addTaskToSchedule(currentFinalSchedule || {}, taskKey, taskInfo.concern, updatedAllTask.ids);
    targetSchedule = sortTasksInScheduleByDate(targetSchedule);

    const targetConcerns = [...new Set([...(currentConcerns || []), taskInfo.concern])];

    let targetAllTasks = combineAllTasks({ oldAllTasks: currentAllTasks, newAllTasks: [updatedAllTask] });
    if (!targetAllTasks.length) targetAllTasks = [updatedAllTask];

    const { minDate, maxDate } = getMinAndMaxRoutineDates(targetAllTasks);

    let updateRoutineId;

    if (targetRoutine) {
      updateRoutineId = targetRoutine._id;

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(targetRoutine._id), userId: new ObjectId(req.userId) },
          {
            $set: {
              finalSchedule: targetSchedule,
              allTasks: targetAllTasks,
              concerns: targetConcerns,
              startsAt: new Date(minDate),
              lastDate: new Date(maxDate),
            },
          }
        )
      );
    } else {
      updateRoutineId = new ObjectId();

      await doWithRetries(async () =>
        db.collection("Routine").insertOne({
          _id: updateRoutineId,
          userId: new ObjectId(req.userId),
          allTasks: targetAllTasks,
          finalSchedule: targetSchedule,
          part: taskInfo.part,
          concerns: [taskInfo.concern],
          status: RoutineStatusEnum.ACTIVE,
          startsAt: new Date(minDate),
          lastDate: new Date(maxDate),
          createdAt: new Date(),
          userName: userInfo.name,
        })
      );
    }

    let taskUpdateOps: any[] = updatedAllTask.ids.map((obj) => {
      return {
        updateOne: {
          filter: {
            _id: obj._id,
          },
          update: {
            $set: {
              startsAt: obj.startsAt,
              routineId: updateRoutineId,
            },
          },
        },
      };
    });

    await doWithRetries(async () => db.collection("Task").bulkWrite(taskUpdateOps));

    const updated = updatedAllTask.ids.map((obj) => ({
      key: taskInfo.key,
      part: taskInfo.part,
      isCreated: taskInfo.isCreated,
    }));

    updateTasksAnalytics({
      userId: req.userId,
      tasksToInsert: updated,
      keyOne: "tasksRescheduled",
    });

    updateTasksAnalytics({
      userId: req.userId,
      tasksToInsert: updated,
      keyOne: "tasksRescheduled",
      keyTwo: "manualTasksRescheduled",
    });

    const routines = await doWithRetries(() =>
      db
        .collection("Routine")
        .find({ _id: { $in: [updateRoutineId, hostRoutine._id] } })
        .toArray()
    );

    res.status(200).json({
      message: routines,
    });
  } catch (err) {
    next(err);
  }
});

export default route;
