import httpError from "@/helpers/httpError.js";
import { stripe } from "init.js";
import updateAnalytics from "./updateAnalytics.js";
import doWithRetries from "@/helpers/doWithRetries.js";

type Props = {
  subscriptionId: string;
  subscriptionName: string | null;
};

export default async function cancelSubscription({
  subscriptionId,
  subscriptionName,
}: Props) {
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

      if (subscriptionName) {
        const incrementPayload: { [key: string]: number } = {
          [`overview.subscription.canceled.${subscriptionName}`]: 1,
        };

        await updateAnalytics(incrementPayload);
      }
    }
  } catch (err) {
    throw httpError(err);
  }
}
