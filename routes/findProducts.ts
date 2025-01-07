import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import findProducts from "functions/findProducts.js";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CategoryNameEnum,
  CustomRequest,
  SolutionType,
  SubscriptionTypeNamesEnum,
} from "types.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";
import checkSubscriptionStatus from "@/functions/checkSubscription.js";
import getUserInfo from "@/functions/getUserInfo.js";
import vectorizeSuggestions from "@/functions/vectorizeSuggestions.js";

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
      const isSubscriptionValid = await checkSubscriptionStatus({
        userId: req.userId,
        subscriptionType: SubscriptionTypeNamesEnum.ADVISOR,
      });

      if (!isSubscriptionValid) {
        res.status(200).json({ error: "subscription expired" });
        return;
      }

      const taskData = await doWithRetries(async () =>
        db.collection("Task").findOne(
          {
            userId: new ObjectId(req.userId),
            expiresAt: { $gt: new Date() },
            key: taskKey,
          },
          {
            projection: {
              description: 1,
              productTypes: 1,
              concern: 1,
              key: 1,
            },
          }
        )
      );

      if (!taskData) return next(httpError(`Task ${taskKey} not not found`));

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: taskKey },
          {
            $set: { isRunning: true, progress: 1 },
            $unset: { isError: "" },
          },
          { upsert: true }
        )
      );

      res.status(200).end();

      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: {
          timeZone: 1,
          concerns: 1,
          demographics: 1,
          specialConsiderations: 1,
        },
      });

      const { timeZone, concerns, demographics, specialConsiderations } =
        userInfo;

      const suggestions = await findProducts({
        taskData: taskData as unknown as SolutionType,
        userInfo: {
          _id: new ObjectId(req.userId),
          specialConsiderations,
          demographics,
          timeZone,
          concerns,
        },
        categoryName: CategoryNameEnum.PRODUCTS,
        analysisType: taskKey,
        criteria,
      });

      await vectorizeSuggestions({
        suggestions,
        categoryName: CategoryNameEnum.PRODUCTS,
      });

      await doWithRetries(async () =>
        db.collection("Task").updateMany(
          {
            userId: new ObjectId(req.userId),
            key: taskKey,
            expiresAt: { $gt: new Date() },
          },
          {
            $set: {
              suggestions,
              productsPersonalized: true,
            },
          }
        )
      );

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: taskKey },
          {
            $set: { isRunning: false, progress: 0 },
          }
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

export default route;
