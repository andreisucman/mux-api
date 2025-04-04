import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import { checkDateValidity } from "helpers/utils.js";
import sortTasksInScheduleByDate from "helpers/sortTasksInScheduleByDate.js";
import { CustomRequest, RoutineStatusEnum, RoutineType, TaskStatusEnum, TaskType } from "types.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskId, startDate } = req.body;

  const { isValidDate, isFutureDate } = checkDateValidity(startDate, req.timeZone);

  if (!ObjectId.isValid(taskId) || !isValidDate || !isFutureDate) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { timeZone: 1, name: 1 },
    });

    if (!userInfo) throw httpError(`User ${req.userId} not found`);

    const taskInfo = (await doWithRetries(async () =>
      db.collection("Task").findOne({ _id: new ObjectId(taskId), userId: new ObjectId(req.userId) })
    )) as unknown as TaskType;

    if (!taskInfo) throw httpError(`Task ${taskId} not found.`);

    const hostRoutine = (await doWithRetries(async () =>
      db
        .collection("Routine")
        .findOne({ _id: new ObjectId(taskInfo.routineId) }, { projection: { allTasks: 1, finalSchedule: 1 } })
    )) as unknown as RoutineType;

    if (!hostRoutine) throw httpError(`${hostRoutine._id} routine not found.`);

    const { allTasks: hostAllTasks, finalSchedule: hostFinalSchedule } = hostRoutine;

    const updatedHostAllTasks = hostAllTasks
      .map((at) => {
        const relevantAllTask = hostAllTasks.find((allTask) => allTask.key === taskInfo.key);
        const updatedRelevantAllTaskIds = relevantAllTask.ids.filter(
          (idObj) => String(idObj._id) !== String(taskInfo._id)
        );
        relevantAllTask.ids = updatedRelevantAllTaskIds;

        if (at.key === taskInfo.key) {
          if (updatedRelevantAllTaskIds.length === 0) return null; // to eliminate empty allTasks
          return relevantAllTask;
        } else {
          return at;
        }
      })
      .filter(Boolean);

    const updatedHostSchedule = Object.fromEntries(
      Object.entries(hostFinalSchedule).map(([date, values]) => {
        if (date === new Date(taskInfo.startsAt).toDateString()) {
          return [date, values.filter((obj) => String(obj._id) !== String(taskInfo._id))];
        } else {
          return [date, values];
        }
      })
    );

    const { minDate: minHostDate, maxDate: maxHostDate } = getMinAndMaxRoutineDates(hostAllTasks);

    if (updatedHostAllTasks.length === 0) {
      await doWithRetries(async () => db.collection("Routine").deleteOne({ _id: new ObjectId(taskInfo.routineId) }));
    } else {
      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(taskInfo._id) },
          {
            $set: {
              allTasks: updatedHostAllTasks,
              finalSchedule: updatedHostSchedule,
              startsAt: new Date(minHostDate),
              lastDate: new Date(maxHostDate),
            },
          }
        )
      );
    }

    const targetRoutine = (await doWithRetries(async () =>
      db
        .collection("Routine")
        .find({
          userId: new ObjectId(req.userId),
          part: taskInfo.part,
          status: RoutineStatusEnum.ACTIVE,
          startsAt: { $lte: new Date(startDate) },
          lastDate: { $gte: new Date(startDate) },
        })
        .sort({ startsAt: 1 })
        .next()
    )) as unknown as RoutineType;

    let {
      concerns: currentConcerns,
      allTasks: currentAllTasks,
      finalSchedule: currentFinalSchedule,
    } = targetRoutine || {};

    const newAllTaskId = { _id: taskInfo._id, startsAt: new Date(startDate), status: TaskStatusEnum.ACTIVE };

    const hostAllTask = hostAllTasks.find((at) => at.key === taskInfo.key);
    const newAllTask = { ...hostAllTask, total: 1, ids: [newAllTaskId] };

    const updatedTargetAllTasks = currentAllTasks.map((at) => {
      if (at.key === taskInfo.key) {
        return {
          ...at,
          ids: [...at.ids, newAllTaskId].sort(
            (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
          ),
        };
      } else {
        return newAllTask;
      }
    });

    let updatedTargetSchedule = { ...currentFinalSchedule };
    updatedTargetSchedule[taskInfo.startsAt.toDateString()] = {
      key: taskInfo.key,
      concern: taskInfo.concern,
      date: taskInfo.startsAt,
    };
    updatedTargetSchedule = sortTasksInScheduleByDate(updatedTargetSchedule);

    const targetConcerns = [...new Set([...(currentConcerns || []), taskInfo.concern])];

    const { minDate, maxDate } = getMinAndMaxRoutineDates(updatedTargetAllTasks);

    let updateRoutineId;

    if (targetRoutine) {
      updateRoutineId = targetRoutine._id;

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(targetRoutine._id) },
          {
            $set: {
              finalSchedule: updatedTargetSchedule,
              allTasks: updatedTargetAllTasks,
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
          allTasks: updatedTargetAllTasks,
          finalSchedule: updatedTargetSchedule,
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

    let taskUpdateOps: any[] = newAllTask.ids.map((obj) => {
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

    const updated = newAllTask.ids.map((obj) => ({
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

    const routine = await doWithRetries(() => db.collection("Routine").findOne({ _id: updateRoutineId }));

    res.status(200).json({
      message: routine,
    });
  } catch (err) {
    next(err);
  }
});

export default route;
