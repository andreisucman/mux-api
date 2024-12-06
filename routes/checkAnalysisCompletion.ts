import { Response, NextFunction } from "express";
import { Router } from "express";
import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import getUserData from "functions/getUserData.js";
import getLatestRoutinesAndTasks from "functions/getLatestRoutineAndTasks.js";
import getLatestStyles from "functions/getLatestStyles.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userId, operationKey } = req.body;
    try {
      if (!ObjectId.isValid(userId)) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const job = await doWithRetries(async () =>
        db.collection("AnalysisStatus").findOne(
          {
            userId: new ObjectId(userId),
            operationKey,
          },
          { projection: { _id: 0 } }
        )
      );

      if (!job) {
        res.status(200).json({
          message: {
            jobProgress: 1,
          },
        });
        return;
      }

      if (job.isError) {
        res.status(200).json({
          error: "An error occured. Please try again.",
        });
        return;
      }

      if (job.isRunning) {
        res.status(200).json({
          message: {
            jobProgress: job.progress,
          },
        });
        return;
      }

      const userData = await getUserData({ userId });
      const { routines, tasks } = await getLatestRoutinesAndTasks({ userId });
      const latestStyleAnalysis = await getLatestStyles({ userId });

      res.status(200).json({
        message: {
          ...userData,
          tasks,
          routines,
          jobProgress: 100,
          latestStyleAnalysis,
          isRunning: job.isRunning,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
