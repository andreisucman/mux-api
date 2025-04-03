import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import { calculateDaysDifference, checkDateValidity, daysFrom } from "helpers/utils.js";
import sortTasksInScheduleByDate from "helpers/sortTasksInScheduleByDate.js";
import { AllTaskTypeWithIds, CustomRequest, RoutineStatusEnum, RoutineType, TaskType } from "types.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskKey, routineId, startDate, timeZone } = req.body;

  const { isValidDate, isFutureDate } = checkDateValidity(startDate, timeZone);

  if (!taskKey || !routineId || !isValidDate || !isFutureDate) {
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
        .find({ routineId: new ObjectId(routineId), key: taskKey })
        .sort({ expiresAt: 1 })
        .next()
    )) as unknown as TaskType;

    if (!taskInfo) throw httpError(`Task ${taskKey} not found.`);

    const hostRoutine = (await doWithRetries(async () =>
      db.collection("Routine").findOne({ _id: new ObjectId(routineId) }, { projection: { allTasks: 1 } })
    )) as unknown as RoutineType;

    if (!hostRoutine) throw httpError(`${routineId} routine not found.`);

    const relevantAllTask = hostRoutine.allTasks.find((allTask) => allTask.key === taskKey);

    const earliestTask = relevantAllTask.ids.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0];

    const differenceInDays = calculateDaysDifference(
      earliestTask.startsAt,
      setToMidnight({ date: startDate, timeZone })
    );

    const updatedAllTask = {
      ...relevantAllTask,
      ids: relevantAllTask.ids.map((obj) => ({
        ...obj,
        startsAt: daysFrom({ date: obj.startsAt, days: differenceInDays }),
      })),
    };

    const part = taskInfo.part;

    /* get the user's current routine */
    const currentRoutine = (await doWithRetries(async () =>
      db
        .collection("Routine")
        .find({
          userId: new ObjectId(req.userId),
          part,
          status: RoutineStatusEnum.ACTIVE,
        })
        .sort({ startsAt: 1 })
        .next()
    )) as unknown as RoutineType;

    let { concerns, allTasks: currentAllTasks, finalSchedule: currentFinalSchedule } = currentRoutine || {};

    let finalSchedule: { [key: string]: ScheduleTaskType[] } = currentFinalSchedule || {};

    finalSchedule = Object.fromEntries(
      Object.entries(finalSchedule)
        .map(([date, tasks]) => [date, tasks.filter((tobj) => tobj.key !== taskKey)])
        .filter(([date, tasks]) => tasks.length)
    );

    /* update final schedule */
    for (let i = 0; i < updatedAllTask.ids.length; i++) {
      const task = updatedAllTask.ids[i];
      const dateString = new Date(task.startsAt).toDateString();

      const simpleTaskContent = {
        _id: task._id,
        key: taskInfo.key,
        concern: taskInfo.concern,
      };

      if (finalSchedule[dateString]) {
        finalSchedule[dateString].push(simpleTaskContent);
      } else {
        finalSchedule[dateString] = [simpleTaskContent];
      }
    }

    finalSchedule = sortTasksInScheduleByDate(finalSchedule);

    let allTasks: AllTaskTypeWithIds[] = currentAllTasks || [];
    allTasks = currentAllTasks.map((at) => (at.key === updatedAllTask.key ? updatedAllTask : at));

    const { minDate, maxDate } = getMinAndMaxRoutineDates(allTasks);

    await doWithRetries(async () =>
      db.collection("Routine").updateOne(
        { _id: new ObjectId(currentRoutine._id) },
        {
          $set: {
            finalSchedule,
            allTasks,
            concerns,
            startsAt: new Date(minDate),
            lastDate: new Date(maxDate),
          },
        }
      )
    );

    let taskUpdateOps: any[] = updatedAllTask.ids.map((obj) => {
      return {
        updateOne: {
          filter: {
            _id: obj._id,
          },
          update: {
            $set: {
              startsAt: obj.startsAt,
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

    const routine = await doWithRetries(() => db.collection("Routine").findOne({ _id: taskInfo.routineId }));

    res.status(200).json({
      message: routine,
    });
  } catch (err) {
    next(err);
  }
});

export default route;
