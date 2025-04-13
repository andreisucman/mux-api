import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import cancelSubscription from "./cancelSubscription.js";
import httpError from "@/helpers/httpError.js";

export default async function cancelRoutineSubscribers(filter: { [key: string]: any }) {
  try {
    const subscribers = await doWithRetries(() =>
      db
        .collection("Purchase")
        .find(
          {
            ...filter,
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
