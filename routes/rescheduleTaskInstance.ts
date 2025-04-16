import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import { checkDateValidity } from "../helpers/utils.js";
import sortTasksInScheduleByDate from "../helpers/sortTasksInScheduleByDate.js";
import { CustomRequest, RoutineStatusEnum, RoutineType, TaskStatusEnum, TaskType } from "../types.js";
import httpError from "../helpers/httpError.js";
import getUserInfo from "../functions/getUserInfo.js";
import updateTasksAnalytics from "../functions/updateTasksAnalytics.js";
import getMinAndMaxRoutineDates from "../helpers/getMinAndMaxRoutineDates.js";
import { db } from "../init.js";
import { checkIfPublic } from "./checkIfPublic.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskId, startDate, targetRoutineId, isVoid } = req.body;

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

    if (!hostRoutine) throw httpError(`${taskInfo.routineId} routine not found.`);

    const { allTasks: hostAllTasks, finalSchedule: hostFinalSchedule } = hostRoutine;

    const updatedHostAllTasks = hostAllTasks
      .map((at) => {
        if (at.key === taskInfo.key) {
          const updatedRelevantAllTaskIds = at.ids.filter((idObj) => String(idObj._id) !== String(taskInfo._id));
          if (updatedRelevantAllTaskIds.length === 0) return null;
          return { ...at, ids: updatedRelevantAllTaskIds };
        }
        return at;
      })
      .filter(Boolean);

    const updatedHostSchedule = Object.fromEntries(
      Object.entries(hostFinalSchedule)
        .map(([date, values]) => [date, values.filter((obj) => String(obj._id) !== String(taskInfo._id))])
        .filter(([date, values]) => values.length > 0)
    );

    const { minDate: minHostDate, maxDate: maxHostDate } = getMinAndMaxRoutineDates(updatedHostAllTasks);

    if (updatedHostAllTasks.length === 0) {
      await doWithRetries(async () =>
        db
          .collection("Routine")
          .updateOne(
            { _id: new ObjectId(taskInfo.routineId), userId: new ObjectId(req.userId) },
            { $set: { deletedOn: new Date() } }
          )
      );
    } else {
      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(taskInfo.routineId), userId: new ObjectId(req.userId) },
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

    const newStartDate = new Date(startDate);
    const newAllTaskId = { _id: taskInfo._id, startsAt: newStartDate, status: TaskStatusEnum.ACTIVE };
    const hostAllTask = hostAllTasks.find((at) => at.key === taskInfo.key);

    if (!hostAllTask) throw httpError("Host routine task not found");
    const newAllTask = { ...hostAllTask, total: 1, ids: [newAllTaskId] };

    let currentConcerns = targetRoutine?.concerns || [];
    let currentAllTasks = targetRoutine?.allTasks || [];
    let currentFinalSchedule = targetRoutine?.finalSchedule || {};

    let updatedTargetAllTasks = [];
    if (currentAllTasks.length > 0) {
      let hasKey = false;
      updatedTargetAllTasks = currentAllTasks.map((at) => {
        if (at.key === taskInfo.key) {
          hasKey = true;
          return {
            ...at,
            ids: [...at.ids, newAllTaskId].sort(
              (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
            ),
          };
        }
        return at;
      });
      if (!hasKey) {
        updatedTargetAllTasks.push(newAllTask);
      }
    } else {
      updatedTargetAllTasks = [newAllTask];
    }

    const newScheduleEntry = {
      key: taskInfo.key,
      concern: taskInfo.concern,
      date: newStartDate,
    };
    currentFinalSchedule[newStartDate.toDateString()] = currentFinalSchedule[newStartDate.toDateString()]
      ? [...currentFinalSchedule[newStartDate.toDateString()], newScheduleEntry]
      : [newScheduleEntry];
    const updatedTargetSchedule = sortTasksInScheduleByDate(currentFinalSchedule);

    const targetConcerns = [...new Set([...currentConcerns, taskInfo.concern])];

    const { minDate, maxDate } = getMinAndMaxRoutineDates(updatedTargetAllTasks);

    let updateRoutineId;
    if (targetRoutine) {
      updateRoutineId = targetRoutine._id;
      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(targetRoutine._id), userId: new ObjectId(req.userId) },
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

      const isPublicResponse = await checkIfPublic({
        userId: String(req.userId),
        concerns: [taskInfo.concern],
      });

      const newRoutine: RoutineType = {
        _id: updateRoutineId,
        userId: new ObjectId(req.userId),
        allTasks: updatedTargetAllTasks,
        finalSchedule: updatedTargetSchedule,
        part: taskInfo.part,
        concerns: targetConcerns,
        status: RoutineStatusEnum.ACTIVE,
        startsAt: new Date(minDate),
        lastDate: new Date(maxDate),
        createdAt: new Date(),
        userName: userInfo.name,
        isPublic: isPublicResponse.isPublic,
      };

      await doWithRetries(async () => db.collection("Routine").insertOne(newRoutine));
    }

    const taskUpdateOps = updatedTargetAllTasks
      .flatMap((at) => at.ids)
      .map((idObj) => ({
        updateOne: {
          filter: { _id: idObj._id },
          update: { $set: { startsAt: idObj.startsAt, routineId: updateRoutineId } },
        },
      }));

    await doWithRetries(async () => db.collection("Task").bulkWrite(taskUpdateOps));

    const updatedTasks = updatedTargetAllTasks.flatMap((at) =>
      at.ids.map(() => ({
        key: taskInfo.key,
        part: taskInfo.part,
        isCreated: taskInfo.isCreated,
      }))
    );

    updateTasksAnalytics({
      userId: req.userId,
      tasksToInsert: updatedTasks,
      keyOne: "tasksRescheduled",
      keyTwo: "manualTasksRescheduled",
    });

    if (isVoid) {
      res.status(200).end();
      return;
    }

    const routines = await doWithRetries(() =>
      db
        .collection("Routine")
        .find({ _id: { $in: [updateRoutineId, hostRoutine._id] } })
        .toArray()
    );

    res.status(200).json({ message: routines });
  } catch (err) {
    next(err);
  }
});

export default route;
