import * as dotenv from "dotenv";
dotenv.config();

import { db, stripe } from "init.js";
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
import { checkIfCanDeductConnectFee } from "@/helpers/utils.js";

// Cache plans for 5 minutes to reduce database load
let cachedPlans: any[] = [];
let lastPlanFetch = 0;

async function createRoutinePurchase(routineDataId: string, buyerId: string, paymentIntentId: string) {
  try {
    const relatedRoutineData: { [key: string]: any } = await fetchRoutineData(routineDataId);

    if (!relatedRoutineData) return;

    const { name, part, concern, userId: sellerId, contentStartDate, contentEndDate } = relatedRoutineData;

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
      concern,
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
        [`overview.payment.purchase.routines.oneTime`]: 1,
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
            "club.payouts.lastSaleDate": new Date(),
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
            concern: 1,
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
          concerns: { $in: [relatedRoutineData.concern] },
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

async function handleInvoicePayment(invoice: Stripe.Invoice) {
  try {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice.payment_intent"],
    });
    const { routineDataId, sellerId } = subscription.metadata || {};

    if (routineDataId) {
      const newSubscribedUntil = new Date(subscription.current_period_end * 1000);

      const sellerInfo = await fetchUserInfo(
        { _id: new ObjectId(sellerId) },
        { "club.payouts.connectId": 1, "club.payouts.lastSaleDate": 1 }
      );

      await updatePurchaseSubscriptionData(
        newSubscribedUntil,
        new ObjectId(routineDataId),
        sellerId,
        sellerInfo.club.payouts.connectId,
        subscriptionId
      );

      const canDeduct = checkIfCanDeductConnectFee(
        sellerInfo.payouts.lastSaleDate ? new Date(sellerInfo.payouts.lastSaleDate) : null
      );

      const chargeId = invoice.charge;
      let amountToTransfer = invoice.amount_paid - Number(process.env.PLATFORM_FEE_PERCENT) * invoice.amount_paid;
      if (canDeduct) amountToTransfer -= 200;

      if (amountToTransfer > 0) {
        await stripe.transfers.create({
          amount: amountToTransfer,
          currency: invoice.currency,
          destination: sellerInfo.club.payouts.connectId,
          source_transaction: chargeId as string,
        });
      }
    }
  } catch (err) {
    throw httpError(err);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const stripeUserId = subscription.customer as string;

    const correspondingPurchase = await doWithRetries(() =>
      db.collection("Purchase").findOne({ subscriptionId: subscription.id })
    );

    if (correspondingPurchase) {
      const buyerInfo = await fetchUserInfo({ stripeUserId }, { _id: 1 });

      await doWithRetries(() =>
        db.collection("Purchase").updateOne({ buyerId: buyerInfo._id }, { $unset: { subscriptionId: null } })
      );
    }
  } catch (err) {
    throw httpError(err);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    const stripeUserId = subscription.customer as string;

    const correspondingPurchase = await doWithRetries(() =>
      db.collection("Purchase").findOne({ subscriptionId: subscription.id })
    );

    if (correspondingPurchase) {
      const buyerInfo = await fetchUserInfo({ stripeUserId });
      let updatePayload: { [key: string]: any } = {};

      if (subscription.cancel_at_period_end) {
        updatePayload = { $set: { isDeactivated: true } };
      } else {
        updatePayload = { $unset: { isDeactivated: null } };
      }

      await doWithRetries(() => db.collection("Purchase").updateOne({ buyerId: buyerInfo._id }, updatePayload));
    }
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
        .updateOne({ routineDataId: new ObjectId(routineDataId) }, { $set: updatePurchasePayload })
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

export async function fetchUserInfo(filter: { [key: string]: any }, projection = {}) {
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

async function handleOneTimePayment(session: Stripe.Checkout.Session) {
  try {
    const { routineDataId, buyerId, part } = session.metadata || {};

    if (routineDataId) {
      await createRoutinePurchase(routineDataId, buyerId, session.payment_intent as string);
    } else {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items.data.price.product"],
      });

      const lineItems = expandedSession.line_items?.data || [];
      const priceIds = lineItems.map((item) => item.price?.id);

      const plans = await getCachedPlans(lastPlanFetch, cachedPlans);

      const isResetScan = priceIds.some((id) => id === plans.find((obj) => obj.name === "scan"));
      const isResetSuggestion = priceIds.some((id) => id === plans.find((obj) => obj.name === "suggestion"));

      const customerId = session.customer as string;
      const relatedUser = await fetchUserInfo({ stripeUserId: customerId }, { nextScan: 1 });

      const updatePayload: { [key: string]: any } = {};
      const incrementPayload: { [key: string]: any } = { [`overview.payment.purchase.platform`]: 1 };

      if (isResetScan) {
        const updatedScans = relatedUser.nextScan.map((obj) => (obj.part === part ? { ...obj, date: null } : obj));
        updatePayload.nextScan = updatedScans;
      }

      if (isResetSuggestion) {
        const updatedSuggestions = relatedUser.nextRoutineSuggestion.map((obj) =>
          obj.part === part ? { ...obj, date: null } : obj
        );
        updatePayload.nextRoutineSuggestion = updatedSuggestions;
      }

      await doWithRetries(() => db.collection("User").updateOne({ stripeUserId: customerId }, { $set: updatePayload }));

      updateAnalytics({
        userId: String(buyerId),
        incrementPayload,
      });
    }
  } catch (err) {
    throw httpError(err);
  }
}

//#endregion

const allowedEvents = [
  "invoice.payment_succeeded",
  "checkout.session.completed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
];

async function handleStripeWebhook(event: Stripe.Event) {
  const { type, data } = event;

  try {
    if (!allowedEvents.includes(type)) return;

    switch (type) {
      case "invoice.payment_succeeded": // fires each time a subscription is renewed whether platform or routine subscription
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
