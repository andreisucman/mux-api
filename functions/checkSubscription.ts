import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  subscriptionType: string;
};

async function checkSubscriptionStatus({ userId, subscriptionType }: Props) {
  try {
    const userInfo = await doWithRetries({
      functionName: "checkSubscriptionStatus",
      functionToExecute: async () =>
        db
          .collection("User")
          .findOne(
            { _id: new ObjectId(userId) },
            { projection: { subscriptions: 1 } }
          ),
    });

    if (!userInfo) throw httpError(`User ${userId} not found`);

    const { subscriptions } = userInfo;

    const relevant = subscriptions[subscriptionType];

    const { validUntil } = relevant || {};

    if (!relevant || !validUntil) return false;

    return new Date() < new Date(relevant.validUntil);
  } catch (err) {
    throw httpError(err);
  }
}

export default checkSubscriptionStatus;
