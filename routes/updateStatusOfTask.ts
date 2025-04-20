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
  newStatus: TaskStatusEnum;
};

const validTaskStatuses = [TaskStatusEnum.ACTIVE, TaskStatusEnum.CANCELED, TaskStatusEnum.COMPLETED];

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskKey, routineId, newStatus }: Props = req.body;

  if (!routineId || !taskKey || (newStatus && !validTaskStatuses.includes(newStatus))) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const tasksToUpdateFilter: { [key: string]: any } = {
      routineId: new ObjectId(routineId),
      key: taskKey,
    };

    const tasksToUpdate = await doWithRetries(async () =>
      db
        .collection("Task")
        .find(tasksToUpdateFilter, {
          projection: { part: 1, isCreated: 1, routineId: 1 },
        })
        .toArray()
    );

    if (tasksToUpdate.length === 0) {
      res.status(200).json({ error: "No tasks to update." });
      return;
    }

    const taskUpdatePayload: { [key: string]: any } = {
      $set: { status: newStatus },
      $unset: {},
    };

    if (newStatus === TaskStatusEnum.CANCELED) {
      await updateTasksAnalytics({
        tasksToInsert: tasksToUpdate,
        keyOne: "tasksCanceled",
        keyTwo: "manualTasksCanceled",
        userId: req.userId,
      });
      taskUpdatePayload.$unset.completedAt = null;
    }

    const relevantTaskIds = tasksToUpdate.map((tObj) => tObj._id);

    await doWithRetries(async () =>
      db.collection("Task").updateMany(
        {
          _id: { $in: relevantTaskIds },
          userId: new ObjectId(req.userId),
        },
        taskUpdatePayload
      )
    );

    const relevantRoutineIds = [...new Set(tasksToUpdate.map((t) => t.routineId))];

    const numberOfTasksWithAnotherStatus = await doWithRetries(async () =>
      db.collection("Task").countDocuments({
        routineId: { $in: relevantRoutineIds },
        status: { $ne: newStatus },
        deletedOn: { $exists: false },
      })
    );

    let routineTaskStatusUpdateOps: any[] = relevantTaskIds.map((taskId) => {
      const update: { [key: string]: any } = {
        "allTasks.$.ids.$[element].status": newStatus,
      };

      if (numberOfTasksWithAnotherStatus === 0) {
        update.status = newStatus;
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

    if (newStatus === TaskStatusEnum.CANCELED) {
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
        if (newStatus === TaskStatusEnum.CANCELED) {
          routineTaskStatusUpdateOps.push(
            ...routinesWithoutActiveTasks.map((id) => ({
              updateOne: {
                filter: { _id: new ObjectId(id) },
                update: { $set: { status: newStatus } },
              },
            }))
          );

          await deactivateHangingBaAndRoutineData({
            routineIds: routinesWithoutActiveTasks,
            userId: req.userId,
          });
        }
      }
    } else if (newStatus === TaskStatusEnum.ACTIVE) {
      routineTaskStatusUpdateOps = routineTaskStatusUpdateOps.map((obj) => ({
        ...obj,
        updateOne: {
          ...obj.updateOne,
          update: {
            ...obj.updateOne.update,
            $set: { ...obj.updateOne.update.$set, status: newStatus },
          },
        },
      }));
    }

    await doWithRetries(async () => db.collection("Routine").bulkWrite(routineTaskStatusUpdateOps));

    await recalculateAllTaskCountAndRoutineDates(relevantRoutineIds);

    const updatedRoutine = await doWithRetries(() =>
      db.collection("Routine").findOne({
        _id: new ObjectId(routineId),
      })
    );

    res.status(200).json({ message: updatedRoutine });
  } catch (err) {
    next(err);
  }
});

export default route;
