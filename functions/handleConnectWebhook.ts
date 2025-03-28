import * as dotenv from "dotenv";
dotenv.config();
import { adminDb, db } from "init.js";
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
  try {
    if (event.type !== "account.updated") return;

    const existingEvent = await adminDb
      .collection("ProcessedEvent")
      .findOne({ eventId: event.id });
    if (existingEvent) {
      console.log(`Event ${event.id} already processed, skipping`);
      return;
    }

    switch (event.type) {
      case "account.updated":
        await handleAccountUpdated(event);
        break;
    }

    await markEventAsProcessed(event.id);
  } catch (err) {
    throw httpError(err);
  }
}

/* Helper Functions */
async function getUserByConnectId(connectId: string, projection: object = {}) {
  return doWithRetries(() =>
    db.collection("User").findOne(
      {
        "club.payouts.connectId": connectId,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      },
      { projection }
    )
  );
}

async function updateUserPayouts(connectId: string, updatePayload: object) {
  await doWithRetries(() =>
    db
      .collection("User")
      .updateOne(
        { "club.payouts.connectId": connectId },
        { $set: updatePayload }
      )
  );
}

async function markEventAsProcessed(eventId: string) {
  await adminDb
    .collection("ProcessedEvent")
    .insertOne({ eventId, createdAt: new Date() });
}

async function handlePayoutsDisabled(userInfo: any) {
  const updatePayload: { [key: string]: any } = {};

  await updateContent({
    userId: String(userInfo._id),
    collections: ["BeforeAfter", "Progress", "Proof", "Diary", "Routine"],
    updatePayload: { isPublic: false },
  });

  if (!userInfo.club.payouts.payoutsDisabledUserNotifiedOn) {
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
      incrementPayload: { "overview.club.payoutsDisabled": 1 },
    });
  }

  return updatePayload;
}

/* Event Handlers */
async function handleAccountUpdated(event: Stripe.Event) {
  const data = event.data as Stripe.AccountUpdatedEvent.Data;
  const account = data.object;
  const connectId = account.id;

  const userInfo = await getUserByConnectId(connectId, {
    _id: 1,
    email: 1,
    "club.payouts.detailsSubmitted": 1,
    "club.payouts.payoutsEnabled": 1,
    "club.payouts.payoutsDisabledUserNotifiedOn": 1,
  });

  if (!userInfo) return console.warn(`User ${connectId} not found`);

  const currentPayoutsEnabled = userInfo.club.payouts.payoutsEnabled;
  const currentDetailsSubmitted = userInfo.club.payouts.detailsSubmitted;

  const updatePayload: { [key: string]: any } = {
    "club.payouts.payoutsEnabled": account.payouts_enabled,
    "club.payouts.detailsSubmitted": account.details_submitted,
    "club.payouts.disabledReason": account.requirements?.disabled_reason,
  };

  if (!account.payouts_enabled && account.details_submitted) {
    const payoutUpdates = await handlePayoutsDisabled(userInfo);
    Object.assign(updatePayload, payoutUpdates);
  }

  await updateUserPayouts(connectId, updatePayload);

  if (!currentDetailsSubmitted && account.details_submitted) {
    updateAnalytics({
      userId: String(userInfo._id),
      incrementPayload: { "overview.club.detailsSubmitted": 1 },
    });
  }

  if (!currentPayoutsEnabled && account.payouts_enabled) {
    updateAnalytics({
      userId: String(userInfo._id),
      incrementPayload: { "overview.club.payoutsEnabled": 1 },
    });
  }
}
