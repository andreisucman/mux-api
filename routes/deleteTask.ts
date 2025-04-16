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

const route = Router();

type Props = {
  taskKey: string;
  routineId: string;
};

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskKey, routineId }: Props = req.body;

  if (!ObjectId.isValid(routineId) || !taskKey) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const tasksToDeleteFilter: { [key: string]: any } = {
      routineId: new ObjectId(routineId),
      userId: new ObjectId(req.userId),
      key: taskKey,
    };

    const now = new Date();

    const tasksToDelete = await doWithRetries(async () =>
      db
        .collection("Task")
        .find(tasksToDeleteFilter, {
          projection: { part: 1, isCreated: 1, routineId: 1 },
        })
        .toArray()
    );

    if (tasksToDeleteFilter.length === 0) {
      res.status(200).json({ error: "No tasks to update." });
      return;
    }

    const tasksToDeletePayload: { [key: string]: any } = {
      $set: { deletedOn: now },
      $unset: {},
    };

    await updateTasksAnalytics({
      tasksToInsert: tasksToDelete,
      keyOne: "tasksDeleted",
      keyTwo: "manualTaskDeleted",
      userId: req.userId,
    });

    const relevantTaskIds = tasksToDelete.map((tObj) => tObj._id);

    await doWithRetries(async () =>
      db.collection("Task").updateMany(
        {
          _id: { $in: relevantTaskIds },
          userId: new ObjectId(req.userId),
        },
        tasksToDeletePayload
      )
    );

    const numberOfNotDeletedTasks = await doWithRetries(async () =>
      db.collection("Task").countDocuments({
        routineId: new ObjectId(routineId),
        deletedOn: { $exists: false },
      })
    );

    const routineTasksUpdateOps: any[] = relevantTaskIds.map((taskId) => {
      const update: { [key: string]: any } = {
        "allTasks.$.ids.$[element].deletedOn": now,
      };
      if (numberOfNotDeletedTasks === 0) {
        update.deletedOn = now;
      }
      return {
        updateOne: {
          filter: {
            "allTasks.ids._id": new ObjectId(taskId),
          },
          update: {
            $set: update,
          },
          arrayFilters: [{ "element._id": new ObjectId(taskId) }],
        },
      };
    });

    await doWithRetries(async () => db.collection("Routine").bulkWrite(routineTasksUpdateOps));

    const numberOfActiveTasks = await doWithRetries(async () =>
      db.collection("Task").countDocuments({
        routineId: new ObjectId(routineId),
        $or: [{ status: TaskStatusEnum.ACTIVE }, { status: TaskStatusEnum.COMPLETED }],
        deletedOn: { $exists: false },
      })
    );

    if (numberOfActiveTasks === 0)
      await deactivateHangingBaAndRoutineData({
        routineIds: [routineId],
        userId: req.userId,
      });

    await recalculateAllTaskCountAndRoutineDates([routineId]);

    const routine = await doWithRetries(() =>
      db.collection("Routine").findOne({
        _id: new ObjectId(routineId),
      })
    );

    res.status(200).json({ message: routine });
  } catch (err) {
    next(err);
  }
});

export default route;
