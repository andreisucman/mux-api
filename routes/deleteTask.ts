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

  if (!routineId || !taskKey) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const tasksToDeleteFilter: { [key: string]: any } = {
      routineId: new ObjectId(routineId),
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
      res.status(200).json({ error: "No tasks to update" });
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

    const routineTasksUpdateOps: any[] = relevantTaskIds.map((taskId) => ({
      updateOne: {
        filter: {
          "allTasks.ids._id": new ObjectId(taskId),
        },
        update: {
          $set: {
            "allTasks.$.ids.$[element].deletedOn": now,
          },
        },
        arrayFilters: [{ "element._id": new ObjectId(taskId) }],
      },
    }));

    const relevantRoutineIds = [...new Set(tasksToDelete.map((t) => t.routineId))];

    const routinesWithActiveTasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .aggregate([
          {
            $match: {
              routineId: { $in: relevantRoutineIds },
              status: {
                $in: [TaskStatusEnum.ACTIVE, TaskStatusEnum.COMPLETED, TaskStatusEnum.EXPIRED],
              },
            },
          },
          { $group: { _id: "$routineId" } },
          { $project: { _id: 1 } },
        ])
        .toArray()
    );

    const activeRoutineIds = routinesWithActiveTasks.map((r) => String(r._id));

    const routinesWithoutActiveTasks = relevantRoutineIds.filter((id) => !activeRoutineIds.includes(String(id)));

    if (routinesWithoutActiveTasks.length > 0) {
      routineTasksUpdateOps.push(
        ...routinesWithoutActiveTasks.map((id) => ({
          updateOne: {
            filter: { _id: new ObjectId(id) },
            update: { $set: { deletedOn: now } },
          },
        }))
      );

      await deactivateHangingBaAndRoutineData({
        routineIds: routinesWithoutActiveTasks,
        userId: req.userId,
      });
    }

    await doWithRetries(async () => db.collection("Routine").bulkWrite(routineTasksUpdateOps));

    await recalculateAllTaskCountAndRoutineDates(relevantRoutineIds);

    const routine = await doWithRetries(() =>
      db
        .collection("Routine")
        .find({
          _id: new ObjectId(routineId),
        })
        .toArray()
    );

    res.status(200).json({ message: routine });
  } catch (err) {
    next(err);
  }
});

export default route;
