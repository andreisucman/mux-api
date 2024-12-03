import { stripe } from "init.js";
import addErrorLog from "functions/addErrorLog.js";

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
    addErrorLog({ functionName: "cancelSubscription", message: err });
    throw err;
  }
}
