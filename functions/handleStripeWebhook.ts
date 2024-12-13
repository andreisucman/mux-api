import * as dotenv from "dotenv";
dotenv.config();

import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

async function handleStripeWebhook(event: any) {
  const { type, data } = event;

  if (type !== "invoice.payment_succeeded" && type !== "invoice.payment_failed")
    return;

  const isPaymentSuccess = type === "invoice.payment_succeeded";

  const object = data.object;
  const customerId = object.customer;
  const subscriptionId = object.subscription;

  if (!customerId) return;

  const userInfo = await doWithRetries(async () =>
    db
      .collection("User")
      .findOne(
        { stripeUserId: customerId },
        { projection: { subscriptions: 1, club: 1 } }
      )
  );

  if (!userInfo) return;

  const plans = await doWithRetries(async () =>
    db.collection("Plan").find({}).toArray()
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

      let subscriptionId = null;
      let newDate = null;

      if (isPaymentSuccess) {
        newDate = new Date(currentValidUntil.getTime());
        newDate.setMonth(newDate.getMonth() + 1);

        // Find the corresponding line item for this subscription
        const relatedLineItem = object.lines.data.find(
          (lineItem: any) => lineItem.price.id === item.priceId
        );

        if (!relatedLineItem)
          throw httpError(
            `No line item found for priceId ${item.priceId} and customerId: ${customerId}.`
          );

        subscriptionId = relatedLineItem.subscription;
      }

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
      filter: { stripeUserId: customerId },
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
}

export default handleStripeWebhook;
