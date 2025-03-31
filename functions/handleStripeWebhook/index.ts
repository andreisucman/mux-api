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
import updateContent from "../updateContent.js";

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
  try {
    const { routineDataId } = subscription.metadata || {};
    if (routineDataId) return;

    const customerId = subscription.customer as string;
    const priceId = subscription.items.data[0].price.id;

    const plan = plans.find((p) => p.priceId === priceId);
    if (!plan) return;

    await updateUserSubscriptionPlan(customerId, subscription, plan);
  } catch (err) {
    throw httpError(err);
  }
}

async function createRoutinePurchase(
  routineDataId: string,
  buyerId: string,
  paymentIntentId: string
) {
  try {
    const relatedRoutineData: { [key: string]: any } = await fetchRoutineData(
      routineDataId
    );

    if (!relatedRoutineData) return;

    const {
      name,
      part,
      userId: sellerId,
      contentStartDate,
      contentEndDate,
    } = relatedRoutineData;

    const [sellerInfo, buyerInfo] = await Promise.all([
      getUserInfo({
        userId: sellerId,
        projection: {
          name: 1,
          email: 1,
          avatar: 1,
          "club.payouts.connectId": 1,
        },
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

    const stripeBalance = await doWithRetries(async () =>
      stripe.balance.retrieve({
        stripeAccount: sellerInfo.club.payouts.connectId,
      })
    );

    const available = stripeBalance.available[0];
    const pending = stripeBalance.pending[0];

    await doWithRetries(() =>
      db.collection("User").updateOne(
        { _id: sellerId },
        {
          $set: {
            "club.payouts.balance": { available, pending },
          },
        }
      )
    );

    const { title, body } = await getEmailContent({
      accessToken: null,
      emailType: "yourPlanPurchased",
    });
    await sendEmail({ to: sellerInfo.email, subject: title, html: body });
  } catch (err) {
    throw httpError(err);
  }
}

async function fetchRoutineData(routineDataId: string) {
  try {
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
  } catch (err) {
    throw httpError(err);
  }
}

async function updateUserSubscriptionPlan(
  customerId: string,
  subscription: Stripe.Subscription,
  plan: any
) {
  try {
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
  } catch (err) {
    throw httpError(err);
  }
}

async function handleSubscriptionPayment(
  session: Stripe.Checkout.Session,
  plans: any[]
) {
  try {
    const subscriptionId = session.subscription as string;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const { routineDataId } = subscription.metadata || {};

    if (routineDataId) return;

    const buyerInfo = await fetchUserInfo(
      { stripeUserId: session.customer },
      { _id: 1 }
    );

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
      userId: String(buyerInfo._id),
      incrementPayload: analyticsUpdate,
    });
  } catch (err) {
    throw httpError(err);
  }
}

async function handleInvoicePayment(invoice: Stripe.Invoice) {
  try {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const { routineDataId, sellerId } = subscription.metadata || {};

    if (!routineDataId) return;

    const newSubscribedUntil = new Date(subscription.current_period_end * 1000);

    const sellerInfo = await fetchUserInfo(
      { _id: new ObjectId(sellerId) },
      { "club.payouts.connectId": 1 }
    );

    await updatePurchaseSubscriptionData(
      newSubscribedUntil,
      new ObjectId(routineDataId),
      sellerId,
      sellerInfo.club.payouts.connectId
    );
  } catch (err) {
    throw httpError(err);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const stripeUserId = subscription.customer as string;
    const buyerInfo = await fetchUserInfo({ stripeUserId }, { _id: 1 });

    await doWithRetries(() =>
      db
        .collection("Purchase")
        .updateOne(
          { buyerId: buyerInfo._id },
          { $unset: { subscriptionId: null } }
        )
    );
  } catch (err) {
    throw httpError(err);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    const stripeUserId = subscription.customer as string;
    const buyerInfo = await fetchUserInfo({ stripeUserId });
    let updatePayload: { [key: string]: any } = {};

    if (subscription.cancel_at || subscription.cancel_at_period_end) {
      updatePayload = { $set: { isDeactivated: true } };
    } else {
      updatePayload = { $unset: { isDeactivated: null } };
    }

    await doWithRetries(() =>
      db
        .collection("Purchase")
        .updateOne({ buyerId: buyerInfo._id }, updatePayload)
    );
  } catch (err) {
    throw httpError(err);
  }
}

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

async function updatePurchaseSubscriptionData(
  newSubscribedUntil: Date,
  routineDataId: ObjectId,
  sellerId: string,
  sellerConnectId: string,
  subscriptionId?: string
) {
  try {
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

    const stripeBalance = await doWithRetries(async () =>
      stripe.balance.retrieve({
        stripeAccount: sellerConnectId,
      })
    );

    const available = stripeBalance.available[0];
    const pending = stripeBalance.pending[0];

    await doWithRetries(() =>
      db.collection("User").updateOne(
        { _id: new ObjectId(sellerId) },
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

async function fetchUserInfo(filter: { [key: string]: any }, projection = {}) {
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
      console.warn(`No active user found`);
    }
    return userInfo;
  } catch (err) {
    throw httpError(err);
  }
}

async function handleOneTimePayment(
  session: Stripe.Checkout.Session,
  plans: any[]
) {
  try {
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
  } catch (err) {
    throw httpError(err);
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

async function handlePayoutsDisabled(userInfo: any) {
  try {
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
        "club.payouts.payoutsDisabledUserNotifiedOn": 1,
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

    if (!account.payouts_enabled && account.details_submitted) {
      const payoutUpdates = await handlePayoutsDisabled(userInfo);
      Object.assign(updatePayload, payoutUpdates);
    }

    await doWithRetries(() =>
      db
        .collection("User")
        .updateOne(
          { "club.payouts.connectId": connectId },
          { $set: updatePayload }
        )
    );

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
  } catch (err) {
    throw httpError(err);
  }
}

async function handleAccountDeauthorized(connectId: string) {
  if (!connectId) return;
  
  try {
    const userInfo = await fetchUserInfo(
      { "club.payouts.connectId": connectId },
      {
        _id: 1,
        email: 1,
      }
    );

    const updatePayload: { [key: string]: any } = {
      "club.payouts.payoutsEnabled": false,
      "club.payouts.disabledReason": "rejected",
    };

    if (!userInfo) return console.warn(`User ${connectId} not found`);

    const { title, body } = await getEmailContent({
      accessToken: null,
      emailType: "payoutsRejected",
    });

    await sendEmail({
      to: userInfo.email,
      subject: title,
      html: body,
    });

    await doWithRetries(() =>
      db
        .collection("User")
        .updateOne(
          { "club.payouts.connectId": connectId },
          { $set: updatePayload }
        )
    );

    updateAnalytics({
      userId: String(userInfo._id),
      incrementPayload: { "overview.club.rejected": 1 },
    });
  } catch (err) {
    throw httpError(err);
  }
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
      type !== "customer.subscription.updated" &&
      type !== "balance.available" &&
      type !== "account.updated" &&
      type !== "account.application.deauthorized"
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

      case "balance.available":
        await handleBalanceAvailable(event.account);
        break;

      case "account.application.deauthorized":
        await handleAccountDeauthorized(event.account);
        break;

      case "account.updated":
        await handleAccountUpdated(event);
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
