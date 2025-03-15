import * as dotenv from "dotenv";
dotenv.config();
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateContentPublicity from "functions/updateContentPublicity.js";
import { defaultClubPrivacy } from "data/defaultClubPrivacy.js";
import httpError from "@/helpers/httpError.js";
import { ModerationStatusEnum } from "@/types.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import sendEmail from "./sendEmail.js";
import updateAnalytics from "./updateAnalytics.js";
import Stripe from "stripe";

/* Stripe requires the raw body to construct the event */
export default async function handleConnectWebhook(event: Stripe.Event) {
  const data = event.data as
    | Stripe.AccountUpdatedEvent.Data
    | Stripe.TransferUpdatedEvent.Data;
  const object = data.object;

  if (event.type !== "account.updated" && event.type !== "transfer.updated")
    return;

  const userInfo = await doWithRetries(async () =>
    db.collection("User").findOne(
      {
        "club.payouts.connectId": object.id,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      },
      {
        projection: {
          _id: 1,
          email: 1,
          "club.payouts.detailsSubmitted": 1,
          "club.payouts.payoutsEnabled": 1,
          "club.payouts.payoutsDisabledUserNotifiedOn": 1,
        },
      }
    )
  );

  if (event.type === "account.updated") {
    try {
      const {
        payoutsEnabled: currentPayoutsEnabled,
        detailsSubmitted: currentDetailsSubmitted,
        payoutsDisabledUserNotifiedOn,
      } = userInfo.club.payouts;

      const { object } = data as Stripe.AccountUpdatedEvent.Data;
      const { payouts_enabled, requirements, details_submitted, email } =
        object;
      const { disabled_reason } = requirements || {};

      const updatePayload: { [key: string]: any } = {
        "club.payouts.payoutsEnabled": payouts_enabled,
        "club.payouts.detailsSubmitted": details_submitted,
        "club.payouts.disabledReason": disabled_reason,
      };

      if (!payouts_enabled && details_submitted) {
        updatePayload["club.privacy"] = defaultClubPrivacy;

        if (!payoutsDisabledUserNotifiedOn) {
          const { title, body } = await getEmailContent({
            accessToken: null,
            emailType: "payoutsDisabled",
          });

          await sendEmail({
            to: email,
            subject: title,
            html: body,
          });
        }
      }

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            "club.payouts.connectId": object.id,
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            $set: updatePayload,
          }
        )
      );

      if (!currentDetailsSubmitted && details_submitted) {
        updateAnalytics({
          userId: String(userInfo._id),
          incrementPayload: {
            "overview.club.detailsSubmitted": 1,
          },
        });
      }

      if (!currentPayoutsEnabled && payouts_enabled) {
        updateAnalytics({
          userId: String(userInfo._id),
          incrementPayload: {
            "overview.club.payoutsEnabled": 1,
          },
        });
      }
    } catch (err) {
      throw httpError(err);
    }
  }

  if (event.type === "transfer.updated") {
    try {
      const { object } = data as Stripe.TransferUpdatedEvent.Data;
      const { amount } = object || {};

      if (typeof amount !== "number" || amount <= 0) return;

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            "club.payouts.connectId": object.id,
          },
          {
            $set: {
              "club.payouts.balance": 0,
            },
          }
        )
      );

      const totalWithdrawn = amount / 100;

      updateAnalytics({
        userId: String(userInfo._id),
        incrementPayload: {
          "accounting.totalWithdrawn": totalWithdrawn,
          "overview.accounting.totalWithdrawn": totalWithdrawn,
          "overview.club.withdrawed": 1,
        },
      });
    } catch (err) {
      throw httpError(err);
    }
  }
}
