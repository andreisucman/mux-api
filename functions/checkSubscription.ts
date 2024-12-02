import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

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

    if (!userInfo) throw new Error("User not found");

    const { subscriptions } = userInfo;

    const relevant = subscriptions[subscriptionType];

    if (!relevant) {
      if (!relevant.validUntil) return false;
    }

    const valid = new Date() < new Date(relevant.validUntil);

    return valid;
  } catch (error) {
    addErrorLog({
      functionName: "checkSubscriptionStatus",
      message: error.message,
    });
    throw error;
  }
}

export default checkSubscriptionStatus;
