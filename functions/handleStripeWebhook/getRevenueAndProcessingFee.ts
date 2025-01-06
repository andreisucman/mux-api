import httpError from "@/helpers/httpError.js";
import { stripe } from "@/init.js";

export async function getRevenueAndProcessingFee(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId.toString(),
      {
        expand: ["latest_charge.balance_transaction"],
      }
    );

    const charge = paymentIntent.latest_charge;
    if (!charge || typeof charge !== "object") {
      throw new Error("No charge found for this payment intent.");
    }

    const transaction = charge.balance_transaction;

    if (!transaction || typeof transaction !== "object") {
      throw new Error("Invalid balance transaction data.");
    }

    const { net, fee } = transaction;

    const totalRevenue = net / 100;
    const totalProcessingFee = fee / 100;

    return { totalRevenue, totalProcessingFee };
  } catch (err) {
    throw httpError(err);
  }
}
