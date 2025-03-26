import * as dotenv from "dotenv";
dotenv.config();

import { adminDb, db, stripe } from "init.js";
import Stripe from "stripe";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ModerationStatusEnum, PurchaseType } from "@/types.js";
import getCachedPlans from "./getCachedPlans.js";
import { ObjectId } from "mongodb";
import getUserInfo from "../getUserInfo.js";
import updateAnalytics from "../updateAnalytics.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import sendEmail from "../sendEmail.js";

// Cache plans for 5 minutes to reduce database load
let cachedPlans: any[] = [];
let lastPlanFetch = 0;

// Helper to sanitize plan names for MongoDB keys
const sanitizePlanName = (name: string) => name.replace(/\./g, "_");

//#region Helper Functions
async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  plans: any[]
) {
  const { routineDataId } = subscription.metadata || {};
  if (routineDataId) return;

  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0].price.id;

  const plan = plans.find((p) => p.priceId === priceId);
  if (!plan) return;

  await updateUserSubscriptionPlan(customerId, subscription, plan);
}

async function createRoutinePurchase(
  routineDataId: string,
  buyerId: string,
  paymentIntentId: string
) {
  const relatedRoutineData: { [key: string]: any } = await fetchRoutineData(
    routineDataId
  );

  if (!relatedRoutineData) return;

  const {
    name,
    part,
    email: sellerEmail,
    userId: sellerId,
    contentStartDate,
    contentEndDate,
  } = relatedRoutineData;

  const [sellerInfo, buyerInfo] = await Promise.all([
    getUserInfo({
      userId: sellerId,
      projection: { name: 1, email: 1, avatar: 1 },
    }),
    getUserInfo({
      userId: buyerId,
      projection: { name: 1, avatar: 1 },
    }),
  ]);

  const newPurchase: PurchaseType = {
    name,
    part,
    buyerId: new ObjectId(buyerId),
    sellerId: new ObjectId(sellerId),
    createdAt: new Date(),
    sellerName: sellerInfo.name,
    sellerAvatar: sellerInfo.avatar,
    buyerName: buyerInfo.name,
    buyerAvatar: buyerInfo.avatar,
    contentStartDate,
    contentEndDate,
    paymentIntentId,
    routineDataId: new ObjectId(routineDataId),
  };

  await doWithRetries(() => db.collection("Purchase").insertOne(newPurchase));

  updateAnalytics({
    userId: String(buyerInfo._id),
    incrementPayload: {
      [`overview.payment.purchase.oneTime`]: 1,
    },
  });

  const paymentIntent = await stripe.paymentIntents.retrieve(
    paymentIntentId as string
  );
  const charge = await stripe.charges.retrieve(
    paymentIntent.latest_charge as string
  );

  const amount = charge.amount - charge.application_fee_amount;

  await doWithRetries(() =>
    db.collection("User").updateOne(
      { _id: sellerId },
      {
        $inc: {
          "club.payouts.balance": amount / 100,
        },
      }
    )
  );

  const { title, body } = await getEmailContent({
    accessToken: null,
    emailType: "yourPlanPurchased",
  });
  await sendEmail({ to: sellerEmail, subject: title, html: body });
}

async function fetchRoutineData(routineDataId: string) {
  const relatedRoutineData = await doWithRetries(() =>
    db.collection("RoutineData").findOne(
      { _id: new ObjectId(routineDataId) },
      {
        projection: {
          updatePrice: 1,
          price: 1,
          name: 1,
          part: 1,
          userId: 1,
          contentStartDate: 1,
        },
      }
    )
  );

  if (!relatedRoutineData) {
    throw httpError(`RoutineData not found for ID: ${routineDataId}`);
  }

  const latestCurrentRoutine = await doWithRetries(() =>
    db
      .collection("Routine")
      .find({
        userId: new ObjectId(relatedRoutineData.userId),
        part: relatedRoutineData.part,
      })
      .project({ createdAt: 1 })
      .sort({ createdAt: -1 })
      .next()
  );

  const result = {
    ...relatedRoutineData,
    contentEndDate: latestCurrentRoutine.createdAt,
  };

  return result;
}

async function updateUserSubscriptionPlan(
  customerId: string,
  subscription: Stripe.Subscription,
  plan: any
) {
  const validUntil = new Date(subscription.current_period_end * 1000);
  const sanitizedPlanName = sanitizePlanName(plan.name);

  await doWithRetries(() =>
    db.collection("User").updateOne(
      { stripeUserId: customerId },
      {
        $set: {
          [`subscriptions.${sanitizedPlanName}`]: {
            subscriptionId: subscription.id,
            validUntil,
            priceId: plan.priceId,
          },
        },
      }
    )
  );
}

async function handleSubscriptionPayment(
  session: Stripe.Checkout.Session,
  plans: any[]
) {
  const subscriptionId = session.subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const { routineDataId, sellerId } = subscription.metadata || {};

  const stripeUserId = session.customer as string;
  const userInfo = await fetchUserInfo(stripeUserId);

  if (routineDataId) {
    const newSubscribedUntil = new Date(subscription.current_period_end * 1000);

    const invoice = await stripe.invoices.retrieve(
      subscription.latest_invoice as string
    );
    const charge = await stripe.charges.retrieve(invoice.charge as string);

    const amount = charge.amount - charge.application_fee_amount;

    await updatePurchaseSubscriptionData(
      newSubscribedUntil,
      new ObjectId(routineDataId),
      sellerId,
      amount,
      subscription.id
    );

    updateAnalytics({
      userId: String(userInfo._id),
      incrementPayload: {
        [`overview.payment.purchase.update`]: 1,
      },
    });
  } else {
    const expandedSession = await stripe.checkout.sessions.retrieve(
      session.id,
      {
        expand: ["line_items.data"],
      }
    );

    const planQuantities = expandedSession.line_items.data.reduce(
      (acc, line) => {
        const plan = plans.find((p) => p.priceId === line.price?.id);
        if (plan) acc[plan.name] = (acc[plan.name] || 0) + (line.quantity ?? 1);
        return acc;
      },
      {} as Record<string, number>
    );

    const analyticsUpdate = Object.entries(planQuantities).reduce(
      (a, [planName, quantity]) => {
        const key = `overview.subscription.purchased.${sanitizePlanName(
          planName
        )}`;
        if (key) {
          a[key] += quantity;
        } else {
          a[key] = quantity;
        }
        return a;
      },
      {}
    );

    updateAnalytics({
      userId: String(userInfo._id),
      incrementPayload: analyticsUpdate,
    });
  }
}

async function handleInvoicePayment(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const { routineDataId, sellerId } = subscription.metadata || {};

  if (!routineDataId) return;

  const newSubscribedUntil = new Date(subscription.current_period_end * 1000);

  const charge = await stripe.charges.retrieve(invoice.charge as string);
  const transfer = await stripe.transfers.retrieve(charge.transfer as string);

  await updatePurchaseSubscriptionData(
    newSubscribedUntil,
    new ObjectId(routineDataId),
    sellerId,
    transfer.amount
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeUserId = subscription.customer as string;
  const userInfo = await fetchUserInfo(stripeUserId);

  await doWithRetries(() =>
    db
      .collection("Purchase")
      .updateOne(
        { buyerId: userInfo._id },
        { $unset: { subscriptionId: null } }
      )
  );
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeUserId = subscription.customer as string;
  const userInfo = await fetchUserInfo(stripeUserId);
  let updatePayload: { [key: string]: any } = {};

  if (subscription.cancel_at || subscription.cancel_at_period_end) {
    updatePayload = { $set: { isDeactivated: true } };
  } else {
    updatePayload = { $unset: { isDeactivated: null } };
  }

  await doWithRetries(() =>
    db
      .collection("Purchase")
      .updateOne({ buyerId: userInfo._id }, updatePayload)
  );
}

async function updatePurchaseSubscriptionData(
  newSubscribedUntil: Date,
  routineDataId: ObjectId,
  sellerId: string,
  amount: number,
  subscriptionId?: string
) {
  const updatePurchasePayload: { [key: string]: any } = {
    contentEndDate: newSubscribedUntil,
  };

  if (subscriptionId) updatePurchasePayload.subscriptionId = subscriptionId;

  await doWithRetries(() =>
    db
      .collection("Purchase")
      .updateOne(
        { routineDataId: new ObjectId(routineDataId) },
        { $set: updatePurchasePayload }
      )
  );

  await doWithRetries(() =>
    db
      .collection("User")
      .updateOne(
        { _id: new ObjectId(sellerId) },
        { $inc: { "club.payouts.balance": amount / 100 } }
      )
  );
}

async function fetchUserInfo(stripeUserId: string, projection = {}) {
  const userInfo = await doWithRetries(() =>
    db.collection("User").findOne(
      {
        stripeUserId,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      },
      { projection: { _id: 1, ...projection } }
    )
  );

  if (!userInfo) {
    console.warn(`No active user found for customer ID: ${stripeUserId}`);
  }
  return userInfo;
}

async function handleOneTimePayment(
  session: Stripe.Checkout.Session,
  plans: any[]
) {
  const { routineDataId, buyerId } = session.metadata || {};

  if (routineDataId) {
    await createRoutinePurchase(
      routineDataId,
      buyerId,
      session.payment_intent as string
    );
  } else {
    const expandedSession = await stripe.checkout.sessions.retrieve(
      session.id,
      {
        expand: ["line_items.data.price.product"],
      }
    );

    const relatedPlan = plans.find((p) => p.name === "scan");
    if (!relatedPlan) return;

    const lineItems = expandedSession.line_items?.data || [];
    const totalQuantity = calculateTotalScanQuantity(lineItems, relatedPlan);

    const customerId = session.customer as string;

    await doWithRetries(() =>
      db
        .collection("User")
        .updateOne(
          { stripeUserId: customerId },
          { $inc: { scanAnalysisQuota: totalQuantity } }
        )
    );
  }
}

function calculateTotalScanQuantity(
  lineItems: Stripe.LineItem[],
  scanPlan: any
) {
  return lineItems.reduce((total, item) => {
    if (item.price?.id === scanPlan.priceId) {
      return total + (item.quantity || 0);
    }
    return total;
  }, 0);
}

async function markEventAsProcessed(eventId: string) {
  await adminDb
    .collection("ProcessedEvent")
    .insertOne({ eventId, createdAt: new Date() });
}
//#endregion

async function handleStripeWebhook(event: Stripe.Event) {
  const { type, data } = event;

  try {
    if (
      type !== "invoice.payment_succeeded" &&
      type !== "checkout.session.completed" &&
      type !== "customer.subscription.created" &&
      type !== "customer.subscription.deleted" &&
      type !== "customer.subscription.updated"
    ) {
      return;
    }

    const existingEvent = await adminDb.collection("ProcessedEvent").findOne({
      eventId: event.id,
    });

    if (existingEvent) {
      console.log(`Event ${event.id} already processed, skipping`);
      return;
    }

    const plans = await getCachedPlans(lastPlanFetch, cachedPlans);

    switch (type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(
          data.object as Stripe.Subscription,
          plans
        );
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePayment(data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(data.object);
        break;

      case "checkout.session.completed":
        if (data.object.mode === "payment") {
          await handleOneTimePayment(
            data.object as Stripe.Checkout.Session,
            plans
          );
        }
        if (data.object.mode === "subscription") {
          await handleSubscriptionPayment(
            data.object as Stripe.Checkout.Session,
            plans
          );
        }
        break;
    }

    await markEventAsProcessed(event.id);
  } catch (err) {
    const statusCode = err.statusCode && err.statusCode < 500 ? 400 : 500;
    throw httpError(`Webhook processing failed: ${err.message}`, statusCode);
  }
}

export default handleStripeWebhook;
