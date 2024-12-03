import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import findProducts from "functions/findProducts.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, SolutionType } from "types.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskKey, criteria } = req.body;

    if (!taskKey || !criteria) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userId = new ObjectId(req.userId);
      /* find user info */
      const userInfo = await doWithRetries({
        functionName: "findProducts - get user info",
        functionToExecute: async () =>
          db.collection("User").findOne(
            { _id: userId },
            {
              projection: {
                specialConsiderations: 1,
                subscriptions: 1,
                demographics: 1,
                timeZone: 1,
                concerns: 1,
              },
            }
          ),
      });

      const { subscriptions } = userInfo;
      const { analyst } = subscriptions;

      const subscriptionEndDate = analyst.validUntil;
      const subscriptionExpired = new Date() > new Date(subscriptionEndDate);

      if (!subscriptionEndDate || subscriptionExpired) {
        res.status(200).json({ error: "subscription expired" });
        return;
      }

      /* find task info */
      const taskData = await doWithRetries({
        functionName: "findProducts - taskInfo",
        functionToExecute: async () =>
          db.collection("Task").findOne(
            { key: taskKey, expiresAt: { $gt: new Date() } },
            {
              projection: {
                description: 1,
                productTypes: 1,
                concern: 1,
                key: 1,
              },
            }
          ),
      });

      if (!taskData) return next(httpError(`Task ${taskKey} not not found`));

      /* update analysis */
      await doWithRetries({
        functionName: "createRoutineRoute - update analysis status",
        functionToExecute: async () =>
          db.collection("AnalysisStatus").updateOne(
            { userId, type: taskKey },
            {
              $set: { isRunning: true, progress: 1 },
              $unset: { isError: "" },
            },
            { upsert: true }
          ),
      });

      res.status(200).end();

      const { timeZone, concerns, demographics, specialConsiderations } =
        userInfo;

      const suggestedProducts = await findProducts({
        taskData: taskData as unknown as SolutionType,
        userInfo: {
          _id: userId,
          specialConsiderations,
          demographics,
          timeZone,
          concerns,
        },
        analysisType: taskKey,
        criteria,
      });

      await doWithRetries({
        functionName: "createTasks - updateTask",
        functionToExecute: async () =>
          db.collection("Task").updateMany(
            { key: taskKey, expiresAt: { $gt: new Date() } },
            {
              $set: {
                suggestions: suggestedProducts,
                productsPersonalized: true,
              },
            }
          ),
      });

      /* update analysis */
      await doWithRetries({
        functionName: "createRoutineRoute - update analysis status",
        functionToExecute: async () =>
          db.collection("AnalysisStatus").updateOne(
            { userId, type: taskKey },
            {
              $set: { isRunning: false, progress: 0 },
              $unset: { isError: "" },
            }
          ),
      });
    } catch (error) {
      // this is async}
    }
  }
);

export default route;
