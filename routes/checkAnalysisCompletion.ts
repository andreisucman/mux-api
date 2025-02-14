import { Response, NextFunction } from "express";
import { Router } from "express";
import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import getUserData from "functions/getUserData.js";
import getLatestRoutinesAndTasks from "functions/getLatestRoutineAndTasks.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userId, operationKey } = req.body;

    try {
      if (!ObjectId.isValid(userId) || !operationKey) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const job = await doWithRetries(async () =>
        db.collection("AnalysisStatus").findOne(
          {
            operationKey,
            userId: new ObjectId(userId),
          },
          {
            projection: {
              _id: 0,
              isError: 1,
              isRunning: 1,
              message: 1,
              progress: 1,
            },
          }
        )
      );

      if (!job) {
        res.status(200).json({
          error: "Job not found. Please try again.",
        });
        return;
      }

      if (job.isError) {
        res.status(200).json({
          error: job.message,
        });

        return;
      }

      if (job.isRunning) {
        res.status(200).json({
          message: {
            jobProgress: Math.min(99, job.progress),
          },
        });
        return;
      }

      const userData = await getUserData({ userId });
      const { routines, tasks } = await getLatestRoutinesAndTasks({ userId });

      res.status(200).json({
        message: {
          ...userData,
          tasks,
          routines,
          jobProgress: 100,
          isRunning: job.isRunning,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
