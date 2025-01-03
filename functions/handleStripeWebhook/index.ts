import * as dotenv from "dotenv";
dotenv.config();

import { db } from "init.js";
import Stripe from "stripe";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import updateAnalytics from "../updateAnalytics.js";
import { ModerationStatusEnum } from "@/types.js";
import { SubscriptionType } from "@/types.js";
import { getRevenueAndProcessingFee } from "./getRevenueAndProcessingFee.js";
import cancelSubscription from "../cancelSubscription.js";

async function handleStripeWebhook(event: Stripe.Event) {
  const { type, data } = event;

  if (type !== "invoice.payment_succeeded") return;

  const object = data.object;
  const customerId = object.customer;
  const subscriptionId = object.subscription;

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

  const paymentPrices = object.lines.data.map((item: any) => item.price);
  const paymentPriceIds = paymentPrices.map((price: any) => price.id);

  if (!subscriptionId || !customerId)
    throw httpError(
      `Missing subscriptionId: ${subscriptionId}, customerId: ${customerId}.`
    );

  if (!Array.isArray(object.lines.data) || object.lines.data.length === 0)
    throw httpError(`Missing lines data items for customerId: ${customerId}.`);

  const relatedPlans = plans.filter((plan) =>
    paymentPriceIds.includes(plan.priceId)
  );

  if (relatedPlans.length === 0)
    throw httpError(
      `Related plan not found for object: ${object.id} and customerId: ${customerId}.`
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
      `No subscriptionsToUpdate for objectId ${object.id} customerId: ${customerId}.`
    );

  const subscriptionsToUpdateWithDates = subscriptionsToUpdate
    .map((item) => {
      const currentValidUntil = item.validUntil
        ? new Date(item.validUntil)
        : new Date();

      const newDate = new Date(currentValidUntil.getTime());
      newDate.setMonth(newDate.getMonth() + 1);

      // Find the corresponding line item for this subscription
      const relatedLineItem = object.lines.data.find(
        (lineItem: any) => lineItem.price.id === item.priceId
      );

      if (!relatedLineItem)
        throw httpError(
          `No line item found for priceId ${item.priceId} and customerId: ${customerId}.`
        );

      const subscriptionId = relatedLineItem.subscription;

      const data = {
        ...item,
        newDate,
        subscriptionId,
      };

      return data;
    })
    .filter(Boolean);

  const toUpdate = subscriptionsToUpdateWithDates.map((item) => ({
    updateOne: {
      filter: {
        stripeUserId: customerId,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      },
      update: {
        $set: {
          [`subscriptions.${item.name}.subscriptionId`]: item.subscriptionId,
          [`subscriptions.${item.name}.validUntil`]: item.newDate,
        },
      },
    },
  }));

  if (toUpdate.length > 0)
    await doWithRetries(
      async () => await db.collection("User").bulkWrite(toUpdate)
    );

  const { payment_intent } = object;

  const { totalRevenue, totalProcessingFee } = await getRevenueAndProcessingFee(
    String(payment_intent)
  );

  const incrementPayload: { [key: string]: number } = {
    "overview.accounting.totalRevenue": totalRevenue,
    "overview.accounting.totalProcessingFee": totalProcessingFee,
    "accounting.totalRevenue": totalRevenue,
    "accounting.totalProcessingFee": totalProcessingFee,
  };

  for (const plan of relatedPlans) {
    incrementPayload[`overview.subscription.bought.${plan.name}`] = 1;

    if (plan.name === "peek") {
      const relatedLineItem = object.lines.data.find(
        (lineItem) => lineItem.price.id === plan.priceId
      );

      incrementPayload[`overview.accounting.totalPayable`] =
        relatedLineItem.amount / 100 / 2;

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

  updateAnalytics({
    userId: String(userInfo._id),
    incrementPayload,
  });
}

export default handleStripeWebhook;
