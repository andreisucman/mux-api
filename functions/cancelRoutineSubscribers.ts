import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";
import cancelSubscription from "./cancelSubscription.js";
import httpError from "@/helpers/httpError.js";

export default async function cancelRoutineSubscribers(userId: string) {
  try {
    const subscribers = await doWithRetries(() =>
      db
        .collection("Purchase")
        .find(
          {
            sellerId: new ObjectId(userId),
            subscriptionId: { $exists: true },
          },
          { projection: { subscriptionId: 1 } }
        )
        .toArray()
    );

    for (const subscription of subscribers) {
      await cancelSubscription({
        subscriptionId: subscription.subscriptionId,
      });
    }
  } catch (err) {
    throw httpError(err);
  }
}
