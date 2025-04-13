import * as dotenv from "dotenv";
dotenv.config();

import { adminDb, db, stripe } from "init.js";
import Stripe from "stripe";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ObjectId } from "mongodb";
import updateAnalytics from "./updateAnalytics.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import sendEmail from "./sendEmail.js";
import updateContent from "./updateContent.js";
import { markEventAsProcessed, fetchUserInfo } from "./handleStripeWebhook/index.js";
import cancelRoutineSubscribers from "./cancelRoutineSubscribers.js";

async function handleBalanceAvailable(connectId: string | undefined) {
  if (!connectId) return;

  try {
    const userInfo = await fetchUserInfo({
      "club.payouts.connectId": connectId,
    });

    const stripeBalance = await doWithRetries(async () =>
      stripe.balance.retrieve({
        stripeAccount: connectId,
      })
    );

    const available = stripeBalance.available[0];
    const pending = stripeBalance.pending[0];

    await doWithRetries(() =>
      db.collection("User").updateOne(
        { _id: new ObjectId(userInfo._id) },
        {
          $set: {
            "club.payouts.balance": { available, pending },
          },
        }
      )
    );
  } catch (err) {
    throw httpError(err);
  }
}

async function handleAccountUpdated(event: Stripe.AccountUpdatedEvent) {
  try {
    const connectId = event.account;
    const data = event.data;
    const account = data.object;

    const userInfo = await fetchUserInfo(
      { "club.payouts.connectId": connectId },
      {
        _id: 1,
        email: 1,
        "club.payouts.detailsSubmitted": 1,
        "club.payouts.payoutsEnabled": 1,
        "club.payouts.lastInformed": 1,
      }
    );

    if (!userInfo) return console.warn(`User ${connectId} not found`);

    const currentPayoutsEnabled = userInfo.club.payouts.payoutsEnabled;
    const currentDetailsSubmitted = userInfo.club.payouts.detailsSubmitted;

    const updatePayload: { [key: string]: any } = {
      "club.payouts.payoutsEnabled": account.payouts_enabled,
      "club.payouts.detailsSubmitted": account.details_submitted,
      "club.payouts.disabledReason": account.requirements?.disabled_reason,
    };

    const analyticsUpdate: { [key: string]: any } = {};

    let emailType = "payoutsEnabled";
    let shouldSendEmail = false;

    if (currentPayoutsEnabled && !account.payouts_enabled) {
      emailType = "payoutsDisabled";

      const isRejected = ["rejected.other", "rejected.fraud", "rejected.tos"].includes(
        account.requirements?.disabled_reason
      );

      const isPaused = account.requirements?.disabled_reason === "platform_paused";

      if (isRejected) {
        emailType = "payoutsRejected";
        shouldSendEmail = userInfo.club.payouts?.lastInformed !== "rejected";
        Object.assign(analyticsUpdate, { "overview.club.payoutsRejected": 1 });
        Object.assign(updatePayload, {
          "club.payouts.lastInformed": "rejected",
        });
      } else if (isPaused) {
        emailType = "payoutsPaused";
        shouldSendEmail = userInfo.club.payouts?.lastInformed !== "paused";
        Object.assign(analyticsUpdate, { "overview.club.payoutsPaused": 1 });
        Object.assign(updatePayload, { "club.payouts.lastInformed": "paused" });
      } else {
        shouldSendEmail = userInfo.club.payouts?.lastInformed !== "disabled";
        Object.assign(analyticsUpdate, { "overview.club.payoutsDisabled": 1 });
        Object.assign(updatePayload, {
          "club.payouts.lastInformed": "disabled",
        });
      }

      if (isRejected) {
        await updateContent({
          collections: ["BeforeAfter", "Progress", "Proof", "Diary", "Routine"],
          updatePayload: { isPublic: false },
          filter: { userId: new ObjectId(userInfo._id) },
        });

        await doWithRetries(() =>
          db
            .collection("RoutineData")
            .updateMany({ userId: new ObjectId(userInfo._id) }, { $set: { status: "hidden" } })
        );

        await cancelRoutineSubscribers({ sellerId: new ObjectId(userInfo._id) });
      }
    }

    if (!currentPayoutsEnabled && account.payouts_enabled) {
      shouldSendEmail = userInfo.club.payouts?.lastInformed !== "enabled";
      Object.assign(analyticsUpdate, { "overview.club.payoutsEnabled": 1 });
      Object.assign(updatePayload, { "club.payouts.lastInformed": "enabled" });
    }

    if (shouldSendEmail) {
      const { title, body } = await getEmailContent({
        accessToken: null,
        emailType: emailType as "payoutsEnabled",
      });

      await sendEmail({
        to: userInfo.email,
        subject: title,
        html: body,
      });
    }

    await doWithRetries(() =>
      db.collection("User").updateOne({ "club.payouts.connectId": connectId }, { $set: updatePayload })
    );

    if (!currentDetailsSubmitted && account.details_submitted) {
      Object.assign(analyticsUpdate, { "overview.club.detailsSubmitted": 1 });
    }

    updateAnalytics({
      userId: String(userInfo._id),
      incrementPayload: analyticsUpdate,
    });
  } catch (err) {
    throw httpError(err);
  }
}

async function handleConnectWebhook(event: Stripe.Event) {
  try {
    if (event.type !== "balance.available" && event.type !== "account.updated") {
      return;
    }

    const existingEvent = await adminDb.collection("ProcessedEvent").findOne({
      eventId: event.id,
    });

    if (existingEvent) {
      console.log(`Event ${event.id} already processed, skipping`);
      return;
    }

    switch (event.type) {
      case "balance.available":
        await handleBalanceAvailable(event.account);
        break;

      case "account.updated":
        await handleAccountUpdated(event);
        break;
    }

    await markEventAsProcessed(event.id);
  } catch (err) {
    const statusCode = err.statusCode && err.statusCode < 500 ? 400 : 500;
    throw httpError(`Webhook processing failed: ${err.message}`, statusCode);
  }
}

export default handleConnectWebhook;
