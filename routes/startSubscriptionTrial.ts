import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import { CustomRequest, SubscriptionType } from "types.js";
import { daysFrom } from "helpers/utils.js";
import { db } from "init.js";

const route = Router();

const allowedSubscriptionNames = ["improvement", "coach", "advisor", "analyst"];

route.post("/", async (req: CustomRequest, res: Response) => {
  const { subscriptionName } = req.body;

  if (!allowedSubscriptionNames.includes(subscriptionName)) {
    res.status(400).json({
      message: `Bad request`,
    });
    return;
  }

  try {
    const userInfo = await doWithRetries({
      functionName: "startSubscriptionTrial - get userInfo",
      functionToExecute: async () =>
        db
          .collection("User")
          .findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { subscriptions: 1 } }
          ),
    });

    const { subscriptions } = userInfo;

    const relevantSubscription: SubscriptionType =
      subscriptions[subscriptionName];

    if (relevantSubscription.isTrialUsed) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const updatedSubscription = {
      ...relevantSubscription,
      isTrialUsed: true,
      validUntil: daysFrom({ days: 1 }),
    };

    const updatedSubscriptions = {
      ...subscriptions,
      [subscriptionName]: updatedSubscription,
    };

    await doWithRetries({
      functionName: "startSubscriptionTrial - update userInfo",
      functionToExecute: async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(req.userId) },
            { $set: { subscriptions: updatedSubscriptions } }
          ),
    });

    res.status(200).end();
  } catch (error) {
    addErrorLog({
      functionName: "startSubscriptionTrial",
      message: error.message,
    });
  }
});

export default route;
