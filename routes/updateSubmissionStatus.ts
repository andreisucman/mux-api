import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, TaskType } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, isSubmitted } = req.body;

    try {
      const taskInfo = (await doWithRetries(async () =>
        db.collection("Task").findOne(
          { _id: new ObjectId(taskId), userId: new ObjectId(req.userId) },
          {
            projection: {
              userId: 1,
              key: 1,
              routineId: 1,
              proofEnabled: 1,
            },
          }
        )
      )) as unknown as TaskType;

      if (!taskInfo) throw httpError(`Task ${taskId} not found`);

      const { proofEnabled, routineId, key } = taskInfo;

      if (proofEnabled && isSubmitted) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const payload: Partial<TaskType> = {
        isSubmitted,
      };

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(routineId), "allTasks.key": key },
          {
            $inc: {
              [`allTasks.$.completed`]: isSubmitted ? -1 : 1,
              [`allTasks.$.unknown`]: isSubmitted ? 1 : -1,
            },
          }
        )
      );

      await doWithRetries(async () =>
        db.collection("Task").updateOne(
          { _id: new ObjectId(taskId) },
          {
            $set: payload,
          }
        )
      );

      res.status(200).json({
        message: {
          status: payload.status,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
