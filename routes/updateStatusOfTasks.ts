import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, TaskStatusEnum } from "types.js";
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

      const updateStatusOps = relevantTaskIds.map((taskId) => {
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

      await doWithRetries(async () =>
        db.collection("Routine").bulkWrite(updateStatusOps)
      );

      if (isVoid) {
        res.status(200).end();
        return;
      }

      const typesUpdated = [...new Set(tasksToUpdate.map((t) => t.type))];

      const response = await getLatestRoutineAndTasks({
        userId: req.userId,
        filter: { type: { $in: typesUpdated } },
        returnOnlyRoutines,
      });

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
