import * as dotenv from "dotenv";
dotenv.config();

import { db, stripe } from "init.js";
import Stripe from "stripe";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import updateAnalytics from "../updateAnalytics.js";
import { ModerationStatusEnum } from "@/types.js";
import { SubscriptionType } from "@/types.js";
import createClubProfile from "../createClubProfile.js";
import { getRevenueAndProcessingFee } from "./getRevenueAndProcessingFee.js";
import cancelSubscription from "../cancelSubscription.js";

async function handleStripeWebhook(event: Stripe.Event) {
  const { type, data } = event;

  if (
    type !== "invoice.payment_succeeded" &&
    type !== "checkout.session.completed"
  )
    return;

  const session = data.object;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!customerId) return;

  const userInfo = await doWithRetries(async () =>
    db.collection("User").findOne(
      {
        stripeUserId: customerId,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      },
      { projection: { subscriptions: 1, club: 1 } }
    )
  );

  if (!userInfo) return;

  const plans = await doWithRetries(async () =>
    db.collection("Plan").find().toArray()
  );

  const { subscriptions } = userInfo;

  const { payment_intent } = session;

  let toUpdateObj: { [key: string]: any } = {};

  let totalRevenue = 0;
  let totalProcessingFee = 0;
  let totalPayable = 0;

  if (payment_intent) {
    const revenueAndFee = await getRevenueAndProcessingFee(
      String(payment_intent)
    );
    totalRevenue = revenueAndFee.totalRevenue;
    totalProcessingFee = revenueAndFee.totalProcessingFee;
    totalPayable = (totalRevenue - totalProcessingFee) / 2;
  }

  const incrementPayload: { [key: string]: number } = {
    "overview.accounting.totalRevenue": totalRevenue,
    "overview.accounting.totalPayable": totalPayable,
    "overview.accounting.totalProcessingFee": totalProcessingFee,
    "accounting.totalRevenue": totalRevenue,
    "accounting.totalPayable": totalPayable,
    "accounting.totalProcessingFee": totalProcessingFee,
  };

  if (type === "invoice.payment_succeeded") {
    const invoice = data.object as Stripe.Invoice;

    const paymentPrices = invoice.lines.data.map((item) => item.price);
    const paymentPriceIds = paymentPrices.map((price) => price.id);

    if (!subscriptionId || !customerId)
      throw httpError(
        `Missing subscriptionId: ${subscriptionId}, customerId: ${customerId}.`
      );

    if (!Array.isArray(invoice.lines.data) || invoice.lines.data.length === 0)
      throw httpError(
        `Missing lines data items for customerId: ${customerId}.`
      );

    const relatedPlans = plans.filter((plan) =>
      paymentPriceIds.includes(plan.priceId)
    );

    if (relatedPlans.length === 0)
      throw httpError(
        `Related plan not found for invoice: ${invoice.id} and customerId: ${customerId}.`
      );

    const subscriptionsToUpdate = relatedPlans
      .filter((plan) => subscriptions[plan.name])
      .map((plan) => ({
        ...subscriptions[plan.name],
        name: plan.name,
        priceId: plan.priceId,
      }));

    if (subscriptionsToUpdate.length === 0)
      throw httpError(
        `No subscriptionsToUpdate for invoiceId ${invoice.id} customerId: ${customerId}.`
      );

    const subscriptionsToUpdateWithDates = subscriptionsToUpdate
      .map((item) => {
        const currentValidUntil = item.validUntil
          ? new Date(item.validUntil)
          : new Date();

        const newDate = new Date(currentValidUntil.getTime());
        newDate.setMonth(newDate.getMonth() + 1);

        const relatedLineItem = invoice.lines.data.find(
          (lineItem) => lineItem.price.id === item.priceId
        );

        if (!relatedLineItem)
          throw httpError(
            `No line item found for priceId ${item.priceId} and customerId: ${customerId}.`
          );

        const subscriptionId = relatedLineItem.subscription;

        return {
          ...item,
          newDate,
          subscriptionId,
        };
      })
      .filter(Boolean);

    toUpdateObj.$set = {};
    for (const item of subscriptionsToUpdateWithDates) {
      toUpdateObj.$set[`subscriptions.${item.name}.subscriptionId`] =
        item.subscriptionId;
      toUpdateObj.$set[`subscriptions.${item.name}.validUntil`] = item.newDate;
    }

    let peekBought = false;

    const planQuantities: { [planName: string]: number } = {};
    for (const lineItem of invoice.lines.data) {
      const plan = plans.find((p) => p.priceId === lineItem.price.id);
      if (plan) {
        const quantity = lineItem.quantity || 1;
        planQuantities[plan.name] = (planQuantities[plan.name] || 0) + quantity;
      }
    }

    for (const [planName, quantity] of Object.entries(planQuantities)) {
      incrementPayload[`overview.subscription.purchased.${planName}`] = quantity;

      if (planName === "peek") {
        peekBought = true;
        const otherActiveSubscriptions = Object.entries(subscriptions).filter(
          ([name, object]: [string, SubscriptionType]) =>
            name !== "peek" &&
            object.validUntil &&
            new Date() < new Date(object.validUntil)
        );

        if (otherActiveSubscriptions.length > 0) {
          for (const [name, object] of otherActiveSubscriptions) {
            await cancelSubscription({
              userId: String(userInfo._id),
              subscriptionId: (object as SubscriptionType).subscriptionId,
              subscriptionName: name,
            });
          }
        }
      }
    }

    if (peekBought) {
      const { club } = userInfo;

      if (!club) {
        await createClubProfile({
          userId: String(userInfo._id),
        });
      }
    }
  }

  if (type === "checkout.session.completed") {
    const session = data.object as Stripe.Checkout.Session;

    const expandedSession = await stripe.checkout.sessions.retrieve(
      session.id,
      {
        expand: ["line_items.data.price.product"],
      }
    );

    const relatedPlan = plans.find((plan) => plan.name === "scan");
    const lineItems = expandedSession.line_items?.data || [];
    let totalQuantity = 0;

    for (const item of lineItems) {
      const quantity = item.quantity || 1;
      const priceId = item.price?.id;

      if (priceId === relatedPlan?.priceId) {
        totalQuantity += quantity;
      }
    }

    toUpdateObj.$inc = { scanAnalysisQuota: totalQuantity };
    incrementPayload[`overview.payment.completed.${relatedPlan?.name}`] =
      totalQuantity;

    const paymentIntentId = session.payment_intent;
    if (paymentIntentId) {
      const { totalRevenue, totalProcessingFee } =
        await getRevenueAndProcessingFee(String(paymentIntentId));
      const totalPayable = (totalRevenue - totalProcessingFee) / 2;

      incrementPayload["overview.accounting.totalRevenue"] += totalRevenue;
      incrementPayload["overview.accounting.totalPayable"] += totalPayable;
      incrementPayload["overview.accounting.totalProcessingFee"] +=
        totalProcessingFee;
      incrementPayload["accounting.totalRevenue"] += totalRevenue;
      incrementPayload["accounting.totalPayable"] += totalPayable;
      incrementPayload["accounting.totalProcessingFee"] += totalProcessingFee;
    }
  }

  await doWithRetries(async () =>
    db.collection("User").updateOne(
      {
        stripeUserId: customerId,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      },
      toUpdateObj
    )
  );

  await updateAnalytics({
    userId: String(userInfo._id),
    incrementPayload,
  });
}

export default handleStripeWebhook;
