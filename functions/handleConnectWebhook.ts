import * as dotenv from "dotenv";
dotenv.config();

import doWithRetries from "helpers/doWithRetries.js";
import updateContentPublicity from "functions/updateContentPublicity.js";
import { defaultClubPrivacy } from "data/defaultClubPrivacy.js";
import { db, stripe } from "init.js";
import httpError from "@/helpers/httpError.js";

/* Stripe requires the raw body to construct the event */
export default async function handleConnectWebhook(event: any) {
  const object = event.data.object;

  if (event.type === "account.updated") {
    try {
      const { payouts_enabled, requirements, details_submitted } = object || {};
      const { disabled_reason } = requirements || {};

      const updatePayload: { [key: string]: any } = {
        "club.isActive": true,
        "club.payouts.payoutsEnabled": payouts_enabled,
        "club.payouts.detailsSubmitted": details_submitted,
        "club.payouts.disabledReason": disabled_reason,
      };

      if (!payouts_enabled) {
        updatePayload["club.privacy"] = defaultClubPrivacy;
      }

      await doWithRetries({
        functionName: "handleConnectWebhook - update user",
        functionToExecute: async () =>
          db.collection("User").updateOne(
            { "club.payouts.connectId": object.id },
            {
              $set: updatePayload,
            }
          ),
      });

      if (!payouts_enabled) {
        const userInfo = await doWithRetries({
          functionName: "handleConnectWebhook - update user",
          functionToExecute: async () =>
            db
              .collection("User")
              .findOne(
                { "club.payouts.connectId": object.id },
                { projection: { _id: 1 } }
              ),
        });

        await updateContentPublicity({
          userId: String(userInfo._id),
          newPrivacy: defaultClubPrivacy,
        });
      }
    } catch (err) {
      throw httpError(err);
    }
  }

  if (event.type === "transfer.paid") {
    try {
      const { amount, status } = object || {};

      if (status !== "paid" || typeof amount !== "number" || amount <= 0)
        return;

      const balance = await stripe.balance.retrieve({
        stripeAccount: object.destination,
      });

      const { available } = balance;

      let sum = 0;

      if (available.length !== 0)
        sum = available.reduce((a, c) => a + c.amount, 0);

      await doWithRetries({
        functionName: "handleConnectWebhook - update user",
        functionToExecute: async () =>
          db.collection("User").updateOne(
            { "club.payouts.connectId": object.id },
            {
              $set: {
                "club.payouts.balance": Number((sum / 100).toFixed(2)),
              },
            }
          ),
      });
    } catch (err) {
      throw httpError(err);
    }
  }
}
