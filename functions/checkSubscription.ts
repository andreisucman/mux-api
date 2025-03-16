import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import httpError from "@/helpers/httpError.js";
import { ModerationStatusEnum, SubscriptionTypeNamesEnum } from "@/types.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

type Props = {
  userId?: string;
  userName?: string;
  subscriptionType: SubscriptionTypeNamesEnum;
};

async function checkSubscriptionStatus({
  userId,
  userName,
  subscriptionType,
}: Props) {
  try {
    if (!userId && !userName) throw httpError("No userId and userName");

    const filters: { [key: string]: any } = {};

    if (userName) {
      filters.name = userName;
    } else {
      filters._id = new ObjectId(userId);
    }
    const userInfo = await doWithRetries(() =>
      db
        .collection("User")
        .findOne(
          { ...filters, moderationStatus: ModerationStatusEnum.ACTIVE },
          { projection: { subscriptions: 1 } }
        )
    );

    if (!userInfo) throw httpError(`User ${userId} not found`);

    const { subscriptions } = userInfo;

    const relevant = subscriptions[subscriptionType];

    if (relevant.validUntil) {
      if (new Date() < new Date(relevant.validUntil)) {
        return true;
      }
    }

    return false;
  } catch (err) {
    throw httpError(err);
  }
}

export default checkSubscriptionStatus;
