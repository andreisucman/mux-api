import * as dotenv from "dotenv";
dotenv.config();
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ModerationStatusEnum } from "@/types.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import sendEmail from "./sendEmail.js";
import updateContent from "./updateContent.js";
import updateAnalytics from "./updateAnalytics.js";
import Stripe from "stripe";

/* Stripe requires the raw body to construct the event */
export default async function handleConnectWebhook(event: Stripe.Event) {
  const data = event.data as
    | Stripe.AccountUpdatedEvent.Data
    | Stripe.TransferUpdatedEvent.Data
    | Stripe.PaymentIntentSucceededEvent.Data;
  const object = data.object;

  if (
    event.type !== "account.updated" &&
    event.type !== "transfer.updated" &&
    event.type !== "payment_intent.succeeded"
  )
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
      const { payouts_enabled, requirements, details_submitted } = object;
      const { disabled_reason } = requirements || {};

      const updatePayload: { [key: string]: any } = {
        "club.payouts.payoutsEnabled": payouts_enabled,
        "club.payouts.detailsSubmitted": details_submitted,
        "club.payouts.disabledReason": disabled_reason,
      };

      if (!payouts_enabled && details_submitted) {
        await updateContent({
          userId: String(userInfo._id),
          collections: ["BeforeAfter", "Progress", "Proof", "Diary", "Routine"],
          updatePayload: { isPublic: false },
        });

        if (!payoutsDisabledUserNotifiedOn) {
          const { title, body } = await getEmailContent({
            accessToken: null,
            emailType: "payoutsDisabled",
          });

          await sendEmail({
            to: userInfo.email,
            subject: title,
            html: body,
          });

          updatePayload.payoutsDisabledUserNotifiedOn = new Date();

          updateAnalytics({
            userId: String(userInfo._id),
            incrementPayload: {
              "overview.club.payoutsDisabled": 1,
            },
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
      const { amount, destination: connectId } = object;

      const userInfo = await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            "club.payouts.connectId": connectId,
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { projection: { _id: 1 } }
        )
      );

      if (!userInfo) throw new Error("User not found");

      const transferredAmount = amount / 100;

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne(
            { "club.payouts.connectId": connectId },
            { $inc: { "club.payouts.balance": -transferredAmount } }
          )
      );

      updateAnalytics({
        userId: String(userInfo._id),
        incrementPayload: {
          "accounting.totalWithdrawn": transferredAmount,
          "overview.accounting.totalWithdrawn": transferredAmount,
          "overview.club.withdrawed": 1,
        },
      });
    } catch (err) {
      throw httpError(err);
    }
  }

  if (event.type === "payment_intent.succeeded") {
    try {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { application_fee_amount, transfer_data, amount } = paymentIntent;
      const connectId = transfer_data?.destination;

      if (!connectId) throw new Error("No destination account");

      const userInfo = await doWithRetries(async () =>
        db
          .collection("User")
          .findOne(
            { "club.payouts.connectId": connectId },
            { projection: { _id: 1, email: 1 } }
          )
      );

      if (!userInfo) throw new Error("User not found");

      const { title, body } = await getEmailContent({
        accessToken: null,
        emailType: "yourPlanPurchased",
      });

      await sendEmail({
        to: userInfo.email,
        subject: title,
        html: body,
      });

      const appFee = (application_fee_amount || 0) / 100;
      const transferredAmount = (amount - appFee * 100) / 100;

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne(
            { "club.payouts.connectId": connectId },
            { $inc: { "club.payouts.balance": transferredAmount } }
          )
      );

      updateAnalytics({
        userId: String(userInfo._id),
        incrementPayload: {
          "overview.accounting.totalPlatformFee": appFee,
          "overview.accounting.totalPayable": transferredAmount,
          "accounting.totalPlatformFee": appFee,
          "accounting.totalPayable": transferredAmount,
        },
      });
    } catch (err) {
      throw httpError(err);
    }
  }
}
