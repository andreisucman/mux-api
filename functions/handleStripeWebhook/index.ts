import * as dotenv from "dotenv";
dotenv.config();

import { adminDb, db, stripe } from "init.js";
import Stripe from "stripe";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import {
  ModerationStatusEnum,
  PurchaseType,
  UserPurchaseType,
} from "@/types.js";
import { getRevenueAndProcessingFee } from "./getRevenueAndProcessingFee.js";
import getCachedPlans from "./getCachedPlans.js";
import { ObjectId } from "mongodb";
import getUserInfo from "../getUserInfo.js";
import updateAnalytics from "../updateAnalytics.js";

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
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0].price.id;

  const plan = plans.find((p) => p.priceId === priceId);
  if (!plan) return;

  await updateUserSubscriptionPlan(customerId, subscription, plan);
}

async function updateUserPurchases(
  existingPurchases: UserPurchaseType[],
  sellerId: ObjectId,
  buyerId: ObjectId,
  routineDataId: ObjectId,
  contentEndDate?: Date
) {
  const relevantPurchase = existingPurchases.find(
    (obj) => String(obj.routineDataId) === String(routineDataId)
  );

  const updateUserPayload: { [key: string]: any } = {};

  if (!relevantPurchase) {
    updateUserPayload.purchases = [{ sellerId, contentEndDate }];
  } else {
    const updatedPurchases = existingPurchases.map((obj) =>
      String(obj.routineDataId) === String(routineDataId)
        ? { ...obj, contentEndDate }
        : obj
    );
    updateUserPayload.purchases = updatedPurchases;
  }

  await doWithRetries(() =>
    db.collection("User").updateOne(
      {
        _id: new ObjectId(buyerId),
      },
      { $set: updateUserPayload }
    )
  );
}

async function createRoutinePurchase(
  routineDataId: string,
  buyerId: string,
  transactionId: string
) {
  const relatedRoutineData: { [key: string]: any } = await fetchRoutineData(
    routineDataId
  );

  console.log("relatedRoutineData", relatedRoutineData);

  if (!relatedRoutineData) return;

  const {
    price,
    name,
    part,
    userId: sellerId,
    contentStartDate,
    contentEndDate,
  } = relatedRoutineData;

  const [sellerInfo, buyerInfo] = await Promise.all([
    getUserInfo({
      userId: sellerId,
      projection: { name: 1, avatar: 1 },
    }),
    getUserInfo({
      userId: buyerId,
      projection: { name: 1, avatar: 1, purchases: 1 },
    }),
  ]);

  const newPurchase: PurchaseType = {
    name,
    part,
    paid: price,
    buyerId: new ObjectId(buyerId),
    sellerId: new ObjectId(sellerId),
    createdAt: new Date(),
    sellerName: sellerInfo.name,
    sellerAvatar: sellerInfo.avatar,
    buyerName: buyerInfo.name,
    buyerAvatar: buyerInfo.avatar,
    transactionId,
    contentStartDate,
    contentEndDate,
    routineDataId: new ObjectId(routineDataId),
  };

  await doWithRetries(() => db.collection("Purchase").insertOne(newPurchase));

  await doWithRetries(() =>
    updateUserPurchases(
      buyerInfo.purchases,
      sellerId,
      new ObjectId(buyerId),
      new ObjectId(routineDataId),
      contentEndDate
    )
  );

  updateAnalytics({
    userId: String(buyerInfo._id),
    incrementPayload: {
      [`overview.payment.purchase.oneTime`]: 1,
    },
  });
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

async function handleInvoicePayment(invoice: Stripe.Invoice, plans: any[]) {
  console.log("handleInvoicePayment ran");
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const { routineDataId } = subscription.metadata || {};

  const stripeUserId = invoice.customer as string;
  const userInfo = await fetchUserInfo(stripeUserId);

  if (routineDataId) {
    const newSubscribedUntil = new Date(subscription.current_period_end * 1000);

    await updatePurchaseSubscriptionDate(
      newSubscribedUntil,
      new ObjectId(routineDataId),
      userInfo._id
    );

    updateAnalytics({
      userId: String(userInfo._id),
      incrementPayload: {
        [`overview.payment.purchase.update`]: 1,
      },
    });
  }

  if (!userInfo) return;

  const { bulkOperations } = await processInvoiceItems(
    invoice,
    plans,
    userInfo,
    stripeUserId
  );

  if (bulkOperations.length > 0) {
    await doWithRetries(() => db.collection("User").bulkWrite(bulkOperations));
  }
}

async function updatePurchaseSubscriptionDate(
  newSubscribedUntil: Date,
  routineDataId: ObjectId,
  buyerId: ObjectId
) {
  console.log(
    "updatePurchaseSubscriptionDate props",
    newSubscribedUntil,
    routineDataId,
    buyerId
  );
  const payload: { [key: string]: any } = {};

  if (newSubscribedUntil) {
    payload.subscribedUntil = newSubscribedUntil;
  }

  await doWithRetries(() =>
    db
      .collection("Purchase")
      .updateOne(
        { routineDataId: new ObjectId(routineDataId) },
        { $set: { subscribedUntil: newSubscribedUntil } }
      )
  );

  const buyerInfo = await doWithRetries(() =>
    db
      .collection("User")
      .findOne({ _id: new ObjectId(buyerId) }, { projection: { purchases: 1 } })
  );

  const relevantPurchase = buyerInfo?.purchases?.find(
    (obj) => String(obj.routineDataId) === String(routineDataId)
  );

  const updateUserPayload: { [key: string]: any } = {};

  if (!relevantPurchase) {
    const updatedPurchases = buyerInfo.purchases.map((obj) =>
      String(obj.routineDataId) === String(routineDataId)
        ? { ...obj, subscribedUntil: newSubscribedUntil }
        : obj
    );
    updateUserPayload.purchases = updatedPurchases;
  }

  console.log(
    "updatePurchaseSubscriptionDate updateUserPayload",
    updateUserPayload
  );

  await doWithRetries(() =>
    db
      .collection("User")
      .updateOne({ _id: new ObjectId(buyerId) }, { $set: updateUserPayload })
  );
}

async function fetchUserInfo(stripeUserId: string) {
  const userInfo = await doWithRetries(() =>
    db.collection("User").findOne(
      {
        stripeUserId,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      },
      { projection: { subscriptions: 1, club: 1, _id: 1 } }
    )
  );

  if (!userInfo) {
    console.warn(`No active user found for customer ID: ${stripeUserId}`);
  }
  return userInfo;
}

async function processInvoiceItems(
  invoice: Stripe.Invoice,
  plans: any[],
  userInfo: any,
  customerId: string
) {
  const paymentPrices = invoice.lines.data.map((item) => item.price?.id);
  const relatedPlans = plans.filter((plan) =>
    paymentPrices.includes(plan.priceId)
  );

  const bulkOperations: any[] = [];
  const incrementPayload: Record<string, number> = {};

  if (relatedPlans.length > 0) {
    const paymentIntentId = invoice.payment_intent as string;
    const { totalRevenue, totalProcessingFee } =
      await getRevenueAndProcessingFee(paymentIntentId);
    const totalPayable = (totalRevenue - totalProcessingFee) / 2;

    Object.assign(incrementPayload, {
      "overview.accounting.totalRevenue": totalRevenue,
      "overview.accounting.totalPayable": totalPayable,
      "overview.accounting.totalProcessingFee": totalProcessingFee,
      "accounting.totalRevenue": totalRevenue,
      "accounting.totalPayable": totalPayable,
      "accounting.totalProcessingFee": totalProcessingFee,
    });

    await processPlanQuantities(invoice, plans, bulkOperations, customerId);
  }

  bulkOperations.push({
    updateOne: {
      filter: { _id: userInfo._id },
      update: { $inc: incrementPayload },
    },
  });

  return { bulkOperations, incrementPayload };
}

async function processPlanQuantities(
  invoice: Stripe.Invoice,
  plans: any[],
  bulkOperations: any[],
  customerId: string
) {
  const planQuantities = invoice.lines.data.reduce((acc, line) => {
    const plan = plans.find((p) => p.priceId === line.price?.id);
    if (plan) {
      acc[plan.name] = (acc[plan.name] || 0) + (line.quantity ?? 1);
    }
    return acc;
  }, {} as Record<string, number>);

  for (const [planName, quantity] of Object.entries(planQuantities)) {
    bulkOperations.push({
      updateOne: {
        filter: { stripeUserId: customerId },
        update: {
          $inc: {
            [`overview.subscription.purchased.${sanitizePlanName(planName)}`]:
              quantity,
          },
        },
      },
    });
  }
}

async function handleCheckoutSessionCompleted(
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
  }

  const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items.data.price.product"],
  });

  const relatedPlan = plans.find((p) => p.name === "scan");
  if (!relatedPlan) return;

  const lineItems = expandedSession.line_items?.data || [];
  const totalQuantity = calculateTotalScanQuantity(lineItems, relatedPlan);

  const bulkOperations = await createScanPlanBulkOperations(
    session,
    totalQuantity
  );

  await doWithRetries(() => db.collection("User").bulkWrite(bulkOperations));
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

async function createScanPlanBulkOperations(
  session: Stripe.Checkout.Session,
  totalQuantity: number
) {
  const customerId = session.customer as string;
  const bulkOperations: any[] = [
    {
      updateOne: {
        filter: { stripeUserId: customerId },
        update: { $inc: { scanAnalysisQuota: totalQuantity } },
      },
    },
  ];

  if (session.payment_intent && typeof session.payment_intent === "string") {
    bulkOperations.push(
      await createScanAccountingOperation(
        customerId,
        session.payment_intent,
        totalQuantity
      )
    );
  }

  return bulkOperations;
}

async function createScanAccountingOperation(
  customerId: string,
  paymentIntentId: string,
  totalQuantity: number
) {
  const { totalRevenue, totalProcessingFee } = await getRevenueAndProcessingFee(
    paymentIntentId
  );
  const totalPayable = (totalRevenue - totalProcessingFee) / 2;

  return {
    updateOne: {
      filter: { stripeUserId: customerId },
      update: {
        $inc: {
          "overview.accounting.totalRevenue": totalRevenue,
          "overview.accounting.totalPayable": totalPayable,
          "overview.accounting.totalProcessingFee": totalProcessingFee,
          "accounting.totalRevenue": totalRevenue,
          "accounting.totalPayable": totalPayable,
          "accounting.totalProcessingFee": totalProcessingFee,
          "overview.payment.completed.scan": totalQuantity,
        },
      },
    },
  };
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
      type !== "customer.subscription.created"
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
        console.log("handleSubscriptionCreated ran");
        await handleSubscriptionCreated(
          data.object as Stripe.Subscription,
          plans
        );
        break;

      case "invoice.payment_succeeded":
        console.log("handleInvoicePayment ran");
        await handleInvoicePayment(data.object as Stripe.Invoice, plans);
        break;

      case "checkout.session.completed":
        console.log("handleCheckoutSessionCompleted ran");
        await handleCheckoutSessionCompleted(
          data.object as Stripe.Checkout.Session,
          plans
        );
        break;
    }

    await markEventAsProcessed(event.id);
  } catch (err) {
    const statusCode = err.statusCode && err.statusCode < 500 ? 400 : 500;
    throw httpError(`Webhook processing failed: ${err.message}`, statusCode);
  }
}

export default handleStripeWebhook;
