import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, RoutineStatusEnum, TaskStatusEnum } from "types.js";
import getLatestTasks from "@/functions/getLatestTasks.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import recalculateAllTaskCountAndRoutineDates from "@/functions/recalculateAllTaskCountAndRoutineDates.js";
import deactivateHangingBaAndRoutineData from "@/functions/deactivateHangingBaAndRoutineData.js";

const route = Router();

type Props = {
  taskIds: string[];
  timeZone?: string;
  isAll?: boolean;
  returnRoutines?: boolean;
  returnTasks?: boolean;
  newStatus: TaskStatusEnum;
  routineStatus?: RoutineStatusEnum;
};

const validTaskStatuses = [
  TaskStatusEnum.ACTIVE,
  TaskStatusEnum.CANCELED,
  TaskStatusEnum.COMPLETED,
];
const validRoutineStatuses = [
  RoutineStatusEnum.ACTIVE,
  RoutineStatusEnum.CANCELED,
];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const {
      isAll,
      taskIds,
      newStatus,
      routineStatus,
      returnTasks,
      returnRoutines,
      timeZone,
    }: Props = req.body;

    if (
      (newStatus && !validTaskStatuses.includes(newStatus)) ||
      (routineStatus && !validRoutineStatuses.includes(routineStatus))
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const tasksToUpdateFilter: { [key: string]: any } = {
        _id: { $in: taskIds.map((id: string) => new ObjectId(id)) },
        userId: new ObjectId(req.userId),
        expiresAt: { $gte: new Date() },
      };

      if (isAll) {
        const keyObjects = await doWithRetries(() =>
          db
            .collection("Task")
            .aggregate([
              {
                $match: {
                  _id: { $in: taskIds.map((id: string) => new ObjectId(id)) },
                },
              },
              {
                $group: {
                  _id: "$key",
                },
              },
              { $project: { _id: 1 } },
            ])
            .toArray()
        );

        const keys = [...new Set(keyObjects.map((obj) => obj._id))].filter(
          Boolean
        );

        if (!keys.length) {
          res.status(400).json({ error: "Bad request" });
          return;
        }

        delete tasksToUpdateFilter._id;
        tasksToUpdateFilter.key = { $in: keys };
      }

      const tasksToUpdate = await doWithRetries(async () =>
        db
          .collection("Task")
          .find(tasksToUpdateFilter, {
            projection: { part: 1, isCreated: 1, routineId: 1 },
          })
          .toArray()
      );

      if (tasksToUpdate.length === 0) {
        res.status(200).json({ error: "No active tasks to update" });
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
      } else if (newStatus === TaskStatusEnum.COMPLETED) {
        await updateTasksAnalytics({
          tasksToInsert: tasksToUpdate,
          keyOne: "tasksMarkedCompleted",
          keyTwo: "manualTasksMarkedCompleted",
          userId: req.userId,
        });
        taskUpdatePayload.$set.completedAt = new Date();
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

      let routineTaskStatusUpdateOps: any[] = relevantTaskIds.map((taskId) => ({
        updateOne: {
          filter: {
            "allTasks.ids._id": new ObjectId(taskId),
          },
          update: {
            $set: {
              "allTasks.$.ids.$[element].status": newStatus,
            },
          },
          arrayFilters: [{ "element._id": new ObjectId(taskId) }],
        },
      }));

      const relevantRoutineIds = [
        ...new Set(tasksToUpdate.map((t) => t.routineId)),
      ];

      if (newStatus === TaskStatusEnum.CANCELED) {
        const routinesWithActiveTasks = await doWithRetries(async () =>
          db
            .collection("Task")
            .aggregate([
              {
                $match: {
                  routineId: { $in: relevantRoutineIds },
                  status: {
                    $in: [
                      TaskStatusEnum.ACTIVE,
                      TaskStatusEnum.COMPLETED,
                      TaskStatusEnum.EXPIRED,
                    ],
                  },
                },
              },
              { $group: { _id: "$routineId" } },
              { $project: { _id: 1 } },
            ])
            .toArray()
        );

        const activeRoutineIds = routinesWithActiveTasks.map((r) =>
          String(r._id)
        );

        const routinesWithoutActiveTasks = relevantRoutineIds.filter(
          (id) => !activeRoutineIds.includes(String(id))
        );

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
          } else {
            routineTaskStatusUpdateOps.push(
              ...routinesWithoutActiveTasks.map((id) => ({
                updateOne: {
                  filter: { _id: new ObjectId(id) },
                  update: { $set: { deletedOn: new Date() } },
                },
              }))
            );
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

      await doWithRetries(async () =>
        db.collection("Routine").bulkWrite(routineTaskStatusUpdateOps)
      );

      if (!returnTasks && !returnRoutines) {
        res.status(200).end();
        return;
      }

      const filter: { [key: string]: any } = {
        _id: { $in: taskIds.map((id) => new ObjectId(id)) },
      };

      await recalculateAllTaskCountAndRoutineDates(relevantRoutineIds);

      let response = { routines: [], tasks: [] };

      if (returnTasks) {
        response.tasks = await getLatestTasks({
          userId: req.userId,
          filter,
          timeZone,
        });
      }

      if (returnRoutines) {
        response.routines = await doWithRetries(() =>
          db
            .collection("Routine")
            .find({
              _id: { $in: relevantRoutineIds },
              deletedOn: { $exists: false },
            })
            .toArray()
        );
      }

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
