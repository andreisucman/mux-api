import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";
import Stripe from "stripe";
import doWithRetries from "@/helpers/doWithRetries.js";

export async function handlePayoutPaid(event: Stripe.PayoutPaidEvent) {
  const payout = event.data.object;

  if (payout.status !== "paid") return;

  const alreadyProcessed = await doWithRetries(
    async () =>
      await db.collection("ProcessedEvents").findOne({ eventId: event.id })
  );

  if (alreadyProcessed) return;

  try {
    await doWithRetries(async () =>
      db.collection("User").updateOne(
        { connectId: payout.destination },
        {
          $inc: {
            "club.payouts.balance": -Math.abs(payout.amount / 100),
          },
          $set: { "club.payouts.lastPayoutDate": new Date() },
        }
      )
    );

    await doWithRetries(() =>
      db.collection("ProcessedEvents").insertOne({ eventId: event.id })
    );
  } catch (err: any) {
    throw httpError(err);
  }
}
