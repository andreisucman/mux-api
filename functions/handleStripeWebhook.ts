import * as dotenv from "dotenv";
dotenv.config();
import { db } from "init.js";
import addErrorLog from "functions/addErrorLog.js";
import doWithRetries from "helpers/doWithRetries.js";

async function handleStripeWebhook(event: any) {
  const { type, data } = event;

  if (type !== "invoice.payment_succeeded") return;

  const object = data.object;
  const customerId = object.customer;
  const subscriptionId = object.subscription;

  if (!customerId) return;

  const userInfo = await doWithRetries({
    functionName: "handleStripeWebhook",
    functionToExecute: async () =>
      db
        .collection("User")
        .findOne(
          { stripeUserId: customerId },
          { projection: { subscriptions: 1, club: 1 } }
        ),
  });

  if (!userInfo) {
    addErrorLog({
      functionName: "handleStripeWebhook - userInfo",
      message: `User with customerId ${customerId} not found.`,
    });
    return;
  }

  const plans = await doWithRetries({
    functionName: "handleStripeWebhook",
    functionToExecute: async () => db.collection("Plan").find({}).toArray(),
  });

  const { subscriptions = {}, club } = userInfo;

  if (type === "invoice.payment_succeeded") {
    const paymentPrices = object.lines.data.map((item: any) => item.price);
    const paymentPriceIds = paymentPrices.map((price: any) => price.id);

    if (!subscriptionId || !customerId) {
      addErrorLog({
        functionName: `handleStripeWebhook`,
        message: `Missing subscriptionId: ${subscriptionId}, customerId: ${customerId}.`,
      });
      return;
    }

    if (!Array.isArray(object.lines.data) || object.lines.data.length === 0) {
      addErrorLog({
        functionName: `handleStripeWebhook`,
        message: `Missing lines data items for customerId: ${customerId}.`,
      });
      return;
    }

    const relatedPlans = plans.filter((plan) =>
      paymentPriceIds.includes(plan.priceId)
    );

    if (relatedPlans.length === 0) {
      addErrorLog({
        functionName: `handleStripeWebhook`,
        message: `Related plan not found for object: ${object.id} and customerId: ${customerId}.`,
      });
      return;
    }

    const subscriptionsToIncrease = relatedPlans
      .filter((plan) => subscriptions[plan.name])
      .map((plan) => ({
        ...subscriptions[plan.name],
        name: plan.name,
        priceId: plan.priceId,
      }));

    if (subscriptionsToIncrease.length === 0) {
      addErrorLog({
        functionName: `handleStripeWebhook`,
        message: `No subscriptionsToIncrease for objectId ${object.id} customerId: ${customerId}.`,
      });
      return;
    }

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

        if (!relatedLineItem) {
          addErrorLog({
            functionName: "handleStripeWebhook",
            message: `No line item found for priceId ${item.priceId} and customerId: ${customerId}.`,
          });
          return null;
        }

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

    await doWithRetries({
      functionName: "handleWebhook - update user's plans",
      functionToExecute: async () =>
        await db.collection("User").bulkWrite(toUpdate),
    });
  }
}

export default handleStripeWebhook;
