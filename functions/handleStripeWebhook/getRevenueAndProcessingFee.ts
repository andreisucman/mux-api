import httpError from "@/helpers/httpError.js";
import { stripe } from "@/init.js";

export async function getRevenueAndProcessingFee(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId.toString(),
      {
        expand: ["charges.data.balance_transaction"],
      }
    );

    const latestCharge = paymentIntent.latest_charge;

    if (typeof latestCharge === "string") return;

    const transaction = latestCharge.balance_transaction;

    if (typeof transaction === "string") return;

    const { net, fee } = transaction;
    const totalRevenue = net / 100;
    const totalProcessingFee = fee / 100;

    return { totalRevenue, totalProcessingFee };
  } catch (err) {
    throw httpError(err);
  }
}
