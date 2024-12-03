import * as dotenv from "dotenv";
dotenv.config();

import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

async function handleStripeWebhook(event: any) {
  const { type, data } = event;

  if (type !== "invoice.payment_succeeded") return;

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

  if (!userInfo)
    throw httpError(`User with customerId ${customerId} not found.`);

  const plans = await doWithRetries(async () =>
    db.collection("Plan").find({}).toArray()
  );

  const { subscriptions = {}, club } = userInfo;

  if (type === "invoice.payment_succeeded") {
    const paymentPrices = object.lines.data.map((item: any) => item.price);
    const paymentPriceIds = paymentPrices.map((price: any) => price.id);

    if (!subscriptionId || !customerId)
      throw httpError(
        `Missing subscriptionId: ${subscriptionId}, customerId: ${customerId}.`
      );

    if (!Array.isArray(object.lines.data) || object.lines.data.length === 0)
      throw httpError(
        `Missing lines data items for customerId: ${customerId}.`
      );

    const relatedPlans = plans.filter((plan) =>
      paymentPriceIds.includes(plan.priceId)
    );

    if (relatedPlans.length === 0)
      throw httpError(
        `Related plan not found for object: ${object.id} and customerId: ${customerId}.`
      );

    const subscriptionsToIncrease = relatedPlans
      .filter((plan) => subscriptions[plan.name])
      .map((plan) => ({
        ...subscriptions[plan.name],
        name: plan.name,
        priceId: plan.priceId,
      }));

    if (subscriptionsToIncrease.length === 0)
      throw httpError(
        `No subscriptionsToIncrease for objectId ${object.id} customerId: ${customerId}.`
      );

    const subscriptionsToIncreaseWithDates = subscriptionsToIncrease
      .map((item) => {
        const currentValidUntil = item.validUntil
          ? new Date(item.validUntil)
          : new Date();
        const newDate = new Date(currentValidUntil);
        newDate.setMonth(newDate.getMonth() + 1);

        // Find the corresponding line item for this subscription
        const relatedLineItem = object.lines.data.find(
          (lineItem: any) => lineItem.price.id === item.priceId
        );

        if (!relatedLineItem)
          throw httpError(
            `No line item found for priceId ${item.priceId} and customerId: ${customerId}.`
          );

        const data = {
          ...item,
          newDate,
          subscriptionId: relatedLineItem.subscription,
        };
        return data;
      })
      .filter(Boolean);

    const toUpdate = subscriptionsToIncreaseWithDates.map((item) => ({
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

    const { payouts } = club || {};
    const { connectId } = payouts || {};

    if (connectId) {
      const clubPlan = relatedPlans.find((plan) => plan.name === "club");
      if (clubPlan) {
        const clubPayment = paymentPrices.find(
          (priceObj: any) => priceObj.id === clubPlan.priceId
        );
        if (clubPayment) {
          const rewardFund =
            (clubPayment.amount / 100) *
            Number(process.env.TRACKER_COMISSION || 0);
          const oneShareAmount = rewardFund / 30;

          toUpdate.push({
            updateOne: {
              filter: { stripeUserId: customerId },
              update: {
                $set: { rewardFund, oneShareAmount },
              },
            },
          });
        }
      }
    }

    await doWithRetries(
      async () => await db.collection("User").bulkWrite(toUpdate)
    );
  }
}

export default handleStripeWebhook;
