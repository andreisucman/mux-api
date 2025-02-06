import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CustomRequest,
  ModerationStatusEnum,
  SubscriptionType,
} from "types.js";
import { daysFrom } from "helpers/utils.js";
import { db } from "init.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

const allowedSubscriptionNames = ["improvement", "advisor"];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { subscriptionName } = req.body;

    if (!allowedSubscriptionNames.includes(subscriptionName)) {
      res.status(400).json({
        message: `Bad request`,
      });
      return;
    }

    try {
      const userInfo = await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { projection: { subscriptions: 1 } }
        )
      );

      const { subscriptions } = userInfo;

      const relevantSubscription: SubscriptionType =
        subscriptions[subscriptionName];

      if (relevantSubscription.isTrialUsed) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const faceProgressRecord = await doWithRetries(async () =>
        db
          .collection("Progress")
          .findOne({ userId: new ObjectId(req.userId), part: "face" })
      );

      if (!faceProgressRecord) {
        res.status(200).json({
          error:
            "You need to scan your face first. Go to the scan page and complete your face analysis.",
        });
        return;
      }

      updateAnalytics({
        userId: req.userId,
        incrementPayload: {
          [`overview.subscription.tried.${subscriptionName}`]: 1,
        },
      });

      const updatedSubscription = {
        ...relevantSubscription,
        isTrialUsed: true,
        validUntil: daysFrom({ days: 1 }),
      };

      const updatedSubscriptions = {
        ...subscriptions,
        [subscriptionName]: updatedSubscription,
      };

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $set: { subscriptions: updatedSubscriptions } }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
