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
  newStatus: TaskStatusEnum;
  returnOnlyRoutines?: boolean;
  isVoid?: boolean;
};

const allowedStatuses = ["active", "canceled", "deleted"];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskIds, newStatus, returnOnlyRoutines, isVoid }: Props = req.body;

    if (!allowedStatuses.includes(newStatus)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const tasksToUpdate = await doWithRetries(async () =>
        db
          .collection("Task")
          .find(
            {
              _id: { $in: taskIds.map((id: string) => new ObjectId(id)) },
              userId: new ObjectId(req.userId),
              expiresAt: { $gt: new Date() },
            },
            { projection: { part: 1, isCreated: 1, routineId: 1, type: 1 } }
          )
          .toArray()
      );

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

      await doWithRetries(async () =>
        db.collection("Task").updateMany(
          {
            _id: { $in: taskIds.map((id: string) => new ObjectId(id)) },
            userId: new ObjectId(req.userId),
          },
          { $set: { status: newStatus } }
        )
      );

      const relevantTaskIds = tasksToUpdate.map((tObj) => tObj._id);

      const routineUpdateOps: any[] = relevantTaskIds.map((taskId) => {
        return {
          updateOne: {
            filter: {
              "allTasks.ids._id": taskId,
            },
            update: {
              $set: {
                "allTasks.$.ids.$[elem].status": newStatus,
              },
            },
            arrayFilters: [
              {
                "elem._id": taskId,
              },
            ],
          },
        };
      });

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

      const response = await getLatestRoutineAndTasks({
        userId: req.userId,
        filter: {
          type: { $in: typesUpdated },
          status: RoutineStatusEnum.ACTIVE,
        },
        returnOnlyRoutines,
      });

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
