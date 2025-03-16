import httpError from "@/helpers/httpError.js";
import { stripe } from "init.js";
import doWithRetries from "@/helpers/doWithRetries.js";

type Props = {
  subscriptionId: string;
};

export default async function cancelSubscription({ subscriptionId }: Props) {
  if (!subscriptionId) return;

  try {
    const subscription = await doWithRetries(() =>
      stripe.subscriptions.retrieve(subscriptionId)
    );

    if (
      subscription.status === "active" ||
      subscription.status === "incomplete"
    ) {
      await doWithRetries(() => stripe.subscriptions.cancel(subscriptionId));
    }
  } catch (err) {
    throw httpError(err);
  }
}
