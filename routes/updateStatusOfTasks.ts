import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, RoutineStatusEnum, TaskStatusEnum } from "types.js";
import getLatestRoutineAndTasks from "functions/getLatestRoutineAndTasks.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";

const route = Router();

type Props = {
  taskIds: string[];
  isVoid?: boolean;
  returnOnlyRoutines?: boolean;
  newStatus: TaskStatusEnum;
  routineStatus?: RoutineStatusEnum;
};

const validTaskStatuses = [
  TaskStatusEnum.ACTIVE,
  TaskStatusEnum.CANCELED,
  TaskStatusEnum.DELETED,
  TaskStatusEnum.COMPLETED,
  TaskStatusEnum.INACTIVE,
];
const validRoutineStatuses = [
  RoutineStatusEnum.ACTIVE,
  RoutineStatusEnum.INACTIVE,
  RoutineStatusEnum.DELETED,
];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const {
      taskIds,
      newStatus,
      routineStatus,
      returnOnlyRoutines,
      isVoid,
    }: Props = req.body;

    if (
      (newStatus && !validTaskStatuses.includes(newStatus)) ||
      (routineStatus && !validRoutineStatuses.includes(routineStatus))
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const tasksToUpdateFilter = {
        _id: { $in: taskIds.map((id: string) => new ObjectId(id)) },
        userId: new ObjectId(req.userId),
        expiresAt: { $gt: new Date() },
      };

      const tasksToUpdate = await doWithRetries(async () =>
        db
          .collection("Task")
          .find(tasksToUpdateFilter, {
            projection: { part: 1, isCreated: 1, routineId: 1, type: 1 },
          })
          .toArray()
      );

      if (tasksToUpdate.length === 0) {
        res.status(200).json({ error: "Can't update an expired task." });
        return;
      }

      if (newStatus === TaskStatusEnum.CANCELED) {
        await updateTasksAnalytics({
          tasksToInsert: tasksToUpdate,
          keyOne: "tasksCanceled",
          keyTwo: "manualTasksCanceled",
          userId: req.userId,
        });
      } else if (newStatus === TaskStatusEnum.DELETED) {
        await updateTasksAnalytics({
          tasksToInsert: tasksToUpdate,
          keyOne: "tasksDeleted",
          keyTwo: "manualTasksDeleted",
          userId: req.userId,
        });
      }

      const relevantTaskIds = tasksToUpdate.map((tObj) => tObj._id);

      await doWithRetries(async () =>
        db.collection("Task").updateMany(
          {
            _id: { $in: relevantTaskIds },
            userId: new ObjectId(req.userId),
          },
          { $set: { status: newStatus,  } }
        )
      );

      const routineUpdateOps: any[] = relevantTaskIds.map((taskId) => ({
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

      const relevantRoutineIds = tasksToUpdate.map((t) => t.routineId);

      if (newStatus === TaskStatusEnum.DELETED) {
        const routinesWithActiveTasks = await doWithRetries(async () =>
          db
            .collection("Task")
            .find(
              {
                routineId: { $in: relevantRoutineIds },
                status: TaskStatusEnum.ACTIVE,
              },
              { projection: { routineId: 1 } }
            )
            .toArray()
        );

        const activeRoutineIds = routinesWithActiveTasks
          .map((r) => r.routineId)
          .map((id) => String(id));

        const routinesToDelete = relevantRoutineIds.filter(
          (id) => !activeRoutineIds.includes(String(id))
        );

        if (routinesToDelete.length > 0)
          routineUpdateOps.push(
            ...routinesToDelete.map((id) => ({
              updateOne: {
                filter: { _id: new ObjectId(id) },
                update: { $set: { status: RoutineStatusEnum.DELETED } },
              },
            }))
          );
      }

      await doWithRetries(async () =>
        db.collection("Routine").bulkWrite(routineUpdateOps)
      );

      if (isVoid) {
        res.status(200).end();
        return;
      }

      const typesUpdated = [...new Set(tasksToUpdate.map((t) => t.type))];

      const filter: { [key: string]: any } = {
        type: { $in: typesUpdated },
      };

      if (routineStatus) filter.status = routineStatus;

      const response = await getLatestRoutineAndTasks({
        userId: req.userId,
        filter,
        returnOnlyRoutines,
      });

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
