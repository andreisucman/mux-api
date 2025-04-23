import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, TaskStatusEnum } from "types.js";
import getLatestTasks from "@/functions/getLatestTasks.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import recalculateAllTaskCountAndRoutineDates from "@/functions/recalculateAllTaskCountAndRoutineDates.js";
import deactivateHangingBaAndRoutineData from "@/functions/deactivateHangingBaAndRoutineData.js";
import setToMidnight from "@/helpers/setToMidnight.js";

const route = Router();

type Props = {
  taskId: string;
  returnRoutine?: boolean;
  returnTask?: boolean;
  newStatus: TaskStatusEnum;
};

const validTaskStatuses = [TaskStatusEnum.ACTIVE, TaskStatusEnum.CANCELED, TaskStatusEnum.COMPLETED];

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskId, newStatus, returnTask, returnRoutine }: Props = req.body;

  if (!ObjectId.isValid(taskId) || !newStatus || !validTaskStatuses.includes(newStatus)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const tasksToUpdateFilter: { [key: string]: any } = {
      _id: new ObjectId(taskId),
      userId: new ObjectId(req.userId),
      expiresAt: { $gte: setToMidnight({ date: new Date(), timeZone: req.timeZone }) },
    };

    const taskToUpdate = await doWithRetries(async () =>
      db.collection("Task").findOne(tasksToUpdateFilter, {
        projection: { part: 1, isCreated: 1, routineId: 1 },
      })
    );

    if (!taskToUpdate) {
      res.status(200).json({ error: "Task not found." });
      return;
    }

    const taskUpdatePayload: { [key: string]: any } = {
      $set: { status: newStatus },
      $unset: {},
    };

    if (newStatus === TaskStatusEnum.CANCELED) {
      await updateTasksAnalytics({
        tasksToInsert: [taskToUpdate],
        keyOne: "tasksCanceled",
        keyTwo: "manualTasksCanceled",
        userId: req.userId,
      });
      taskUpdatePayload.$unset.completedAt = null;
    } else if (newStatus === TaskStatusEnum.COMPLETED) {
      await updateTasksAnalytics({
        tasksToInsert: [taskToUpdate],
        keyOne: "tasksMarkedCompleted",
        keyTwo: "manualTasksMarkedCompleted",
        userId: req.userId,
      });
      const todayMidnight = setToMidnight({ date: new Date(), timeZone: req.timeZone, dontSetToMidnight: true });
      taskUpdatePayload.$set.completedAt = todayMidnight;
    }

    await doWithRetries(async () =>
      db.collection("Task").updateOne(
        {
          _id: taskToUpdate._id,
          userId: new ObjectId(req.userId),
        },
        taskUpdatePayload
      )
    );

    let numberOfTasksWithAnotherStatus;
    if ([TaskStatusEnum.ACTIVE, TaskStatusEnum.CANCELED].includes(newStatus)) {
      numberOfTasksWithAnotherStatus = await doWithRetries(async () =>
        db.collection("Task").countDocuments({
          routineId: taskToUpdate.routineId,
          status: { $ne: newStatus },
          deletedOn: { $exists: false },
        })
      );
    }

    const updateRoutineFilter = { "allTasks.ids._id": new ObjectId(taskId), userId: new ObjectId(req.userId) };
    const updateRoutinePayload: { [key: string]: any } = { $set: { "allTasks.$.ids.$[element].status": newStatus } };
    if (newStatus === TaskStatusEnum.ACTIVE || numberOfTasksWithAnotherStatus === 0) {
      updateRoutinePayload.$set.status = newStatus;
    }

    await doWithRetries(async () =>
      db.collection("Routine").updateOne(updateRoutineFilter, updateRoutinePayload, {
        arrayFilters: [{ "element._id": new ObjectId(taskId) }],
      })
    );

    if (newStatus === TaskStatusEnum.CANCELED) {
      const numberOfActiveTasks = await doWithRetries(async () =>
        db.collection("Task").countDocuments({
          routineId: taskToUpdate.routineId,
          $or: [{ status: TaskStatusEnum.ACTIVE }, { status: TaskStatusEnum.COMPLETED }],
          deletedOn: { $exists: false },
        })
      );

      if (numberOfActiveTasks === 0)
        await deactivateHangingBaAndRoutineData({
          routineIds: [taskToUpdate.routineId],
          userId: req.userId,
        });
    }

    await recalculateAllTaskCountAndRoutineDates([taskToUpdate.routineId]);

    let response = { routine: null, task: null };

    if (returnTask) {
      response.task = await getLatestTasks({
        userId: req.userId,
        filter: { _id: new ObjectId(taskToUpdate._id) },
        timeZone: req.timeZone,
      });
    }

    if (returnRoutine) {
      response.routine = await doWithRetries(() =>
        db.collection("Routine").findOne({
          _id: new ObjectId(taskToUpdate.routineId),
        })
      );
    }

    res.status(200).json({ message: response });
  } catch (err) {
    next(err);
  }
});

export default route;
