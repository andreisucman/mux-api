import * as dotenv from "dotenv";
dotenv.config();

import { db, stripe } from "init.js";
import Stripe from "stripe";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ModerationStatusEnum } from "@/types.js";
import { getRevenueAndProcessingFee } from "./getRevenueAndProcessingFee.js";
import getCachedPlans from "./getCachedPlans.js";

// Cache plans for 5 minutes to reduce database load
let cachedPlans: any[] = [];
let lastPlanFetch = 0;

async function handleStripeWebhook(event: Stripe.Event) {
  const { type, data } = event;

  try {
    if (
      type !== "invoice.payment_succeeded" &&
      type !== "checkout.session.completed" &&
      type !== "customer.subscription.created"
    ) {
      console.log(`Unhandled event type: ${type}`);
      return;
    }

    const existingEvent = await db.collection("ProcessedEvent").findOne({
      eventId: event.id,
    });

    if (existingEvent) {
      console.log(`Event ${event.id} already processed, skipping`);
      return;
    }

    const plans = await getCachedPlans(lastPlanFetch, cachedPlans);

    if (type === "customer.subscription.created") {
      const subscription = data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const priceId = subscription.items.data[0].price.id;

      const plan = plans.find((p) => p.priceId === priceId);
      if (!plan) return;

      // Use Stripe's period end instead of local calculation
      const validUntil = new Date(subscription.current_period_end * 1000);

      const updateResult = await doWithRetries(async () =>
        db.collection("User").updateOne(
          { stripeUserId: customerId },
          {
            $set: {
              [`subscriptions.${plan.name}`]: {
                subscriptionId: subscription.id,
                validUntil: validUntil,
                priceId: priceId,
              },
            },
          }
        )
      );

      if (updateResult.modifiedCount === 0) {
        console.warn(`No user found for customer ID: ${customerId}`);
      }

      return;
    }

    const session = data.object;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    if (!customerId) {
      console.warn("Missing customer ID in event");
      return;
    }

    const userInfo = await doWithRetries(async () =>
      db.collection("User").findOne(
        {
          stripeUserId: customerId,
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        { projection: { subscriptions: 1, club: 1, _id: 1 } }
      )
    );

    if (!userInfo) {
      console.warn(`No active user found for customer ID: ${customerId}`);
      return;
    }

    const { subscriptions } = userInfo;
    let toUpdateObj: { [key: string]: any } = {};
    let incrementPayload: { [key: string]: number } = {};

    if (type === "invoice.payment_succeeded") {
      const invoice = data.object as Stripe.Invoice;
      const paymentPrices = invoice.lines.data.map((item) => item.price.id);
      const relatedPlans = plans.filter((plan) =>
        paymentPrices.includes(plan.priceId)
      );

      if (!subscriptionId) throw httpError("Missing subscription ID");

      const paymentIntentId = invoice.payment_intent as string;
      const { totalRevenue, totalProcessingFee } =
        await getRevenueAndProcessingFee(paymentIntentId);
      const totalPayable = (totalRevenue - totalProcessingFee) / 2;

      incrementPayload = {
        "overview.accounting.totalRevenue": totalRevenue,
        "overview.accounting.totalPayable": totalPayable,
        "overview.accounting.totalProcessingFee": totalProcessingFee,
        "accounting.totalRevenue": totalRevenue,
        "accounting.totalPayable": totalPayable,
        "accounting.totalProcessingFee": totalProcessingFee,
      };

      const subscriptionsToUpdate = relatedPlans
        .filter((plan) => subscriptions[plan.name])
        .map((plan) => ({
          ...subscriptions[plan.name],
          name: plan.name,
          priceId: plan.priceId,
        }));

      toUpdateObj.$set = {};
      for (const item of subscriptionsToUpdate) {
        const subscription = await stripe.subscriptions.retrieve(
          item.subscriptionId
        );
        const validUntil = new Date(subscription.current_period_end * 1000);

        toUpdateObj.$set[`subscriptions.${item.name}.validUntil`] = validUntil;
        toUpdateObj.$set[`subscriptions.${item.name}.subscriptionId`] =
          subscriptionId;
      }

      const planQuantities = invoice.lines.data.reduce((acc, line) => {
        const plan = plans.find((p) => p.priceId === line.price.id);
        if (plan) acc[plan.name] = (acc[plan.name] || 0) + (line.quantity || 1);
        return acc;
      }, {} as Record<string, number>);

      for (const [planName, quantity] of Object.entries(planQuantities)) {
        incrementPayload[`overview.subscription.purchased.${planName}`] =
          quantity;
      }
    }

    if (type === "checkout.session.completed") {
      const checkoutSession = data.object as Stripe.Checkout.Session;
      const expandedSession = await stripe.checkout.sessions.retrieve(
        checkoutSession.id,
        {
          expand: ["line_items.data.price.product"],
        }
      );

      const relatedPlan = plans.find((p) => p.name === "scan");
      const lineItems = expandedSession.line_items?.data || [];
      let totalQuantity = 0;

      for (const item of lineItems) {
        if (item.price?.id === relatedPlan?.priceId) {
          totalQuantity += item.quantity || 1;
        }
      }

      toUpdateObj.$inc = { scanAnalysisQuota: totalQuantity };
      incrementPayload[`overview.payment.completed.scan`] = totalQuantity;

      if (checkoutSession.payment_intent) {
        const { totalRevenue, totalProcessingFee } =
          await getRevenueAndProcessingFee(
            checkoutSession.payment_intent as string
          );
        const totalPayable = (totalRevenue - totalProcessingFee) / 2;

        Object.assign(incrementPayload, {
          "overview.accounting.totalRevenue": totalRevenue,
          "overview.accounting.totalPayable": totalPayable,
          "overview.accounting.totalProcessingFee": totalProcessingFee,
          "accounting.totalRevenue": totalRevenue,
          "accounting.totalPayable": totalPayable,
          "accounting.totalProcessingFee": totalProcessingFee,
        });
      }
    }

    const bulkOperations = [];

    if (Object.keys(toUpdateObj).length > 0) {
      bulkOperations.push({
        updateOne: {
          filter: { stripeUserId: customerId },
          update: toUpdateObj,
        },
      });
    }

    if (Object.keys(incrementPayload).length > 0) {
      bulkOperations.push({
        updateOne: {
          filter: { _id: userInfo._id },
          update: {
            $inc: incrementPayload,
          },
        },
      });
    }

    if (bulkOperations.length > 0) {
      await doWithRetries(async () =>
        db.collection("User").bulkWrite(bulkOperations, { ordered: false })
      );
    }

    await db.collection("ProcessedEvent").insertOne({
      eventId: event.id,
    });
  } catch (err) {
    console.error(`Webhook error (${event.id}):`, err.stack);
    throw httpError(`Webhook processing failed: ${err.message}`, 400);
  }
}

export default handleStripeWebhook;
