import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import { calculateDaysDifference, checkDateValidity, daysFrom } from "helpers/utils.js";
import { CustomRequest, RoutineStatusEnum, RoutineType, TaskStatusEnum, TaskType } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import checkPurchaseAccess from "@/functions/checkPurchaseAccess.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import { checkIfPublic } from "./checkIfPublic.js";
import updateRoutineDataStats from "@/functions/updateRoutineDataStats.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskKey, routineId, ignoreIncompleteTasks, targetRoutineId, startDate, userName } = req.body;

  const { isValidDate, isFutureDate } = checkDateValidity(startDate, req.timeZone);

  if (!taskKey || !ObjectId.isValid(routineId) || !isValidDate || !isFutureDate) {
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

    if (!taskInfo) throw httpError(`No task to add from user ${userName} to user ${req.userId} found.`);

    const hostRoutine = (await doWithRetries(async () =>
      db.collection("Routine").findOne({ _id: new ObjectId(routineId) }, { projection: { allTasks: 1 } })
    )) as unknown as RoutineType;

    if (!hostRoutine) throw httpError(`${routineId} routine not found.`);

    const relevantAllTask = hostRoutine.allTasks.find((allTask) => allTask.key === taskKey);

    const earliestTask = relevantAllTask.ids.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0];

    const newDate = setToMidnight({ date: startDate, timeZone: req.timeZone });

    const differenceInDays = calculateDaysDifference(earliestTask.startsAt, newDate);

    const updatedIds = relevantAllTask.ids.filter((id) => {
      let rule = !id.deletedOn;
      if (ignoreIncompleteTasks) {
        rule = rule && [TaskStatusEnum.COMPLETED, TaskStatusEnum.ACTIVE].includes(id.status);
      }
      return rule;
    });

    const updatedAllTask = {
      ...relevantAllTask,
      ids: updatedIds.map((obj) => ({
        ...obj,
        _id: new ObjectId(),
        status: TaskStatusEnum.ACTIVE,
        startsAt: daysFrom({ date: obj.startsAt, days: differenceInDays }),
      })),
    };

    const accessObject = await checkPurchaseAccess({
      parts: [taskInfo.part],
      concerns: [taskInfo.concern],
      targetUserId: String(taskInfo.userId),
      userId: req.userId,
    });

    const hasAccess = accessObject.parts.length + accessObject.concerns.length > 0;

    if (!hasAccess) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    taskInfo = {
      ...taskInfo,
      proofEnabled: true,
      completedAt: null,
      userName: userInfo.name,
      copiedFrom: userName,
      userId: new ObjectId(req.userId),
      status: TaskStatusEnum.ACTIVE,
      previousRecipe: null,
    };

    delete taskInfo.proofId;

    let draftTasks: TaskType[] = updatedAllTask.ids.map((obj) => {
      return {
        ...taskInfo,
        _id: obj._id,
        startsAt: obj.startsAt,
        expiresAt: daysFrom({ date: obj.startsAt, days: 1 }),
        status: obj.status,
      };
    });

    const targetRoutineFilter = targetRoutineId
      ? { _id: new ObjectId(targetRoutineId), userId: new ObjectId(req.userId) }
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

    let { concerns, allTasks: currentAllTasks } = targetRoutine || {};

    let allTasks = combineAllTasks({ oldAllTasks: currentAllTasks, newAllTasks: [updatedAllTask] });
    if (!allTasks) allTasks = [updatedAllTask];

    const { minDate, maxDate } = getMinAndMaxRoutineDates(allTasks);

    let updateRoutineId;

    if (targetRoutine) {
      updateRoutineId = targetRoutine._id;

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(targetRoutine._id), userId: new ObjectId(req.userId) },
          {
            $set: {
              allTasks,
              concerns: [...new Set([...(concerns || []), taskInfo.concern])],
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
        allTasks,
        part: taskInfo.part,
        concerns: [taskInfo.concern],
        status: RoutineStatusEnum.ACTIVE,
        startsAt: new Date(minDate),
        lastDate: new Date(maxDate),
        createdAt: new Date(),
        copiedFrom: userName,
        userName: userInfo.name,
        isPublic: isPublicResponse.isPublic,
      };

      await doWithRetries(async () => db.collection("Routine").insertOne(newRoutine));
    }

    draftTasks = draftTasks.map((t) => ({ ...t, routineId: updateRoutineId }));

    await doWithRetries(async () => db.collection("Task").insertMany(draftTasks));

    const updatedRoutine = await doWithRetries(async () =>
      db.collection("Routine").findOne({
        _id: new ObjectId(updateRoutineId),
      })
    );

    updateTasksAnalytics({
      userId: req.userId,
      tasksToInsert: draftTasks,
      keyOne: "tasksCreated",
    });

    updateTasksAnalytics({
      userId: req.userId,
      tasksToInsert: draftTasks,
      keyOne: "tasksCopied",
      keyTwo: "manualTasksCopied",
    });

    if (userName) {
      updateTasksAnalytics({
        userId: req.userId,
        tasksToInsert: draftTasks,
        keyOne: "tasksStolen",
        keyTwo: "manualTasksStolen",
      });
    }

    updateRoutineDataStats({ userId: req.userId, part: taskInfo.part, concerns: [taskInfo.concern] });

    res.status(200).json({
      message: updatedRoutine,
    });
  } catch (err) {
    next(err);
  }
});

export default route;
