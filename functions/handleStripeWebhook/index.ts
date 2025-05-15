import * as dotenv from "dotenv";
dotenv.config();

import { db, stripe } from "init.js";
import Stripe from "stripe";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ModerationStatusEnum } from "@/types.js";
import getCachedPlans from "./getCachedPlans.js";
import updateAnalytics from "../updateAnalytics.js";

// Cache plans for 5 minutes to reduce database load
let cachedPlans: any[] = [];
let lastPlanFetch = 0;

export async function fetchUserInfo(
  filter: { [key: string]: any },
  projection = {}
) {
  try {
    const userInfo = await doWithRetries(() =>
      db.collection("User").findOne(
        {
          ...filter,
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        { projection: { _id: 1, ...projection } }
      )
    );

    if (!userInfo) {
      console.warn(`No active user found for ${JSON.stringify(filter)}`);
    }
    return userInfo;
  } catch (err) {
    throw httpError(err);
  }
}

async function handleOneTimePayment(session: Stripe.Checkout.Session) {
  try {
    const { buyerId, part } = session.metadata || {};

    const expandedSession = await stripe.checkout.sessions.retrieve(
      session.id,
      {
        expand: ["line_items.data.price.product"],
      }
    );

    const lineItems = expandedSession.line_items?.data || [];
    const priceIds = lineItems.map((item) => item.price?.id);

    const plans = await getCachedPlans(lastPlanFetch, cachedPlans);

    const isResetScan = priceIds.some(
      (id) => id === plans.find((obj) => obj.name === "scan")
    );
    const isResetSuggestion = priceIds.some(
      (id) => id === plans.find((obj) => obj.name === "suggestion")
    );

    const customerId = session.customer as string;
    const relatedUser = await fetchUserInfo(
      { stripeUserId: customerId },
      { nextScan: 1 }
    );

    const updatePayload: { [key: string]: any } = {};
    const incrementPayload: { [key: string]: any } = {
      [`overview.user.payment.purchase.platform`]: 1,
    };

    if (isResetScan) {
      const updatedScans = relatedUser.nextScan.map((obj) =>
        obj.part === part ? { ...obj, date: null } : obj
      );
      updatePayload.nextScan = updatedScans;
    }

    if (isResetSuggestion) {
      const updatedSuggestions = relatedUser.nextRoutineSuggestion.map((obj) =>
        obj.part === part ? { ...obj, date: null } : obj
      );
      updatePayload.nextRoutineSuggestion = updatedSuggestions;
    }

    await doWithRetries(() =>
      db
        .collection("User")
        .updateOne({ stripeUserId: customerId }, { $set: updatePayload })
    );

    updateAnalytics({
      userId: String(buyerId),
      incrementPayload,
    });
  } catch (err) {
    throw httpError(err);
  }
}

//#endregion

const allowedEvents = ["checkout.session.completed"];

async function handleStripeWebhook(event: Stripe.Event) {
  const { type, data } = event;

  try {
    if (!allowedEvents.includes(type)) return;

    switch (type) {
      case "checkout.session.completed":
        if (data.object.mode === "payment") {
          await handleOneTimePayment(data.object as Stripe.Checkout.Session);
        }
        break;
    }
  } catch (err) {
    const statusCode = err.statusCode && err.statusCode < 500 ? 400 : 500;
    throw httpError(`Webhook processing failed: ${err.message}`, statusCode);
  }
}

export default handleStripeWebhook;
