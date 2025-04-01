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

const route = Router();

type Props = {
  taskIds: string[];
  timeZone?: string;
  isAll?: boolean;
  returnRoutines?: boolean;
  returnTasks?: boolean;
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { isAll, taskIds, returnTasks, returnRoutines, timeZone }: Props =
      req.body;

    try {
      const tasksToDeleteFilter: { [key: string]: any } = {
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

        delete tasksToDeleteFilter._id;
        tasksToDeleteFilter.key = { $in: keys };
      }

      const now = new Date();

      const tasksToDelete = await doWithRetries(async () =>
        db
          .collection("Task")
          .find(tasksToDeleteFilter, {
            projection: { part: 1, isCreated: 1, routineId: 1 },
          })
          .toArray()
      );

      if (tasksToDelete.length === 0) {
        res.status(200).json({ error: "No active tasks to update" });
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

      const relevantRoutineIds = [
        ...new Set(tasksToDelete.map((t) => t.routineId)),
      ];

      console.log("relevantRoutineIds", relevantRoutineIds);

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
                    TaskStatusEnum.INACTIVE,
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

      await doWithRetries(async () =>
        db.collection("Routine").bulkWrite(routineTasksUpdateOps)
      );

      if (!returnTasks && !returnRoutines) {
        res.status(200).end();
        return;
      }

      await recalculateAllTaskCountAndRoutineDates(relevantRoutineIds);

      const filter: { [key: string]: any } = {
        _id: { $in: taskIds.map((id) => new ObjectId(id)) },
      };

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
