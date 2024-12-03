import httpError from "@/helpers/httpError.js";
import { stripe } from "init.js";

export default async function cancelSubscription(subscriptionId: string) {
  if (!subscriptionId) return;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (
      subscription.status === "active" ||
      subscription.status === "incomplete"
    ) {
      await stripe.subscriptions.cancel(subscriptionId);
    }
  } catch (err) {
    throw httpError(err);
  }
}
