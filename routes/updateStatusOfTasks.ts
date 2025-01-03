import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest, TaskStatusEnum } from "types.js";
import getLatestRoutineAndTasks from "functions/getLatestRoutineAndTasks.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateAnalytics from "@/functions/updateAnalytics.js";

const route = Router();

type Props = {
  taskIds: string[];
  newStatus: TaskStatusEnum;
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskIds, newStatus }: Props = req.body;

    try {
      if (newStatus === TaskStatusEnum.CANCELED) {
        const tasksToUpdate = await doWithRetries(async () =>
          db
            .collection("Task")
            .find(
              {
                _id: { $in: taskIds.map((id: string) => new ObjectId(id)) },
                userId: new ObjectId(req.userId),
              },
              { projection: { part: 1, isCreated: 1 } }
            )
            .toArray()
        );

        const partsCreatedTasks = tasksToUpdate
          .map((t) => t.part)
          .reduce((a: { [key: string]: number }, c: string) => {
            const key = `overview.tasks.part.tasksCanceled.${c}`;
            if (a[key]) {
              a[key] += 1;
            } else {
              a[key] = 1;
            }

            return a;
          }, {});

        const partsCreatedManualTasks = tasksToUpdate
          .filter((t) => t.isCreated)
          .map((t) => t.part)
          .reduce((a: { [key: string]: number }, c: string) => {
            const key = `overview.tasks.part.manualTasksCanceled.${c}`;
            if (a[key]) {
              a[key] += 1;
            } else {
              a[key] = 1;
            }

            return a;
          }, {});

        updateAnalytics({
          userId: req.userId,
          incrementPayload: {
            "overview.usage.tasksCanceled": tasksToUpdate.length,
            ...partsCreatedTasks,
            ...partsCreatedManualTasks,
          },
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

      const response = await getLatestRoutineAndTasks({ userId: req.userId });

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
