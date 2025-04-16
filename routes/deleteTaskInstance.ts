import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, TaskStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import recalculateAllTaskCountAndRoutineDates from "@/functions/recalculateAllTaskCountAndRoutineDates.js";
import deactivateHangingBaAndRoutineData from "@/functions/deactivateHangingBaAndRoutineData.js";
import setToMidnight from "@/helpers/setToMidnight.js";

const route = Router();

type Props = {
  taskId: string;
};

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskId }: Props = req.body;

  if (!ObjectId.isValid(taskId)) {
    res.status(200).json({ error: "Bad request" });
    return;
  }

  try {
    const tasksToDeleteFilter: { [key: string]: any } = {
      _id: new ObjectId(taskId),
      userId: new ObjectId(req.userId),
      expiresAt: { $gte: setToMidnight({ date: new Date(), timeZone: req.timeZone }) },
    };

    const now = new Date();

    const taskToDelete = await doWithRetries(async () =>
      db.collection("Task").findOne(tasksToDeleteFilter, {
        projection: { part: 1, isCreated: 1, routineId: 1 },
      })
    );

    if (!taskToDelete) {
      res.status(200).json({ error: "No active tasks to update." });
      return;
    }

    await updateTasksAnalytics({
      tasksToInsert: [taskToDelete],
      keyOne: "tasksDeleted",
      keyTwo: "manualTaskDeleted",
      userId: req.userId,
    });

    await doWithRetries(async () =>
      db.collection("Task").updateOne(
        {
          _id: taskToDelete._id,
          userId: new ObjectId(req.userId),
        },
        { $set: { deletedOn: now } }
      )
    );

    const numberOfNotDeletedTasks = await doWithRetries(async () =>
      db.collection("Task").countDocuments({
        routineId: taskToDelete.routineId,
        deletedOn: { $exists: false },
      })
    );

    const updateRoutineFilter = {
      "allTasks.ids._id": new ObjectId(taskId),
      userId: new ObjectId(req.userId),
    };

    const updateRoutinePayload: { [key: string]: any } = {
      $set: { "allTasks.$.ids.$[element].deletedOn": now },
    };

    if (numberOfNotDeletedTasks === 0) {
      updateRoutinePayload.$set.deletedOn = now;
    }

    await doWithRetries(async () =>
      db.collection("Routine").updateOne(updateRoutineFilter, updateRoutinePayload, {
        arrayFilters: [{ "element._id": new ObjectId(taskId) }],
      })
    );

    const numberOfActiveTasks = await doWithRetries(async () =>
      db.collection("Task").countDocuments({
        routineId: taskToDelete.routineId,
        $or: [{ status: TaskStatusEnum.ACTIVE }, { status: TaskStatusEnum.COMPLETED }],
        deletedOn: { $exists: false },
      })
    );

    if (numberOfActiveTasks === 0) {
      await deactivateHangingBaAndRoutineData({
        routineIds: [taskToDelete.routineId],
        userId: req.userId,
      });
    }

    await recalculateAllTaskCountAndRoutineDates([taskToDelete.routineId]);

    const updatedRoutine = await doWithRetries(() =>
      db.collection("Routine").findOne({
        _id: taskToDelete.routineId,
      })
    );

    res.status(200).json({ message: updatedRoutine });
  } catch (err) {
    next(err);
  }
});

export default route;
