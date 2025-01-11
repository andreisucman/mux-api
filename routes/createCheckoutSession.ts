import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import cancelSubscription from "functions/cancelSubscription.js";
import { CustomRequest } from "types.js";
import { db, stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { priceId, redirectUrl, cancelUrl } = req.body;

    if (!priceId || !redirectUrl || !cancelUrl) {
      res.status(400).json("Bad request");
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { stripeUserId: 1 },
      });

      const { stripeUserId } = userInfo;

      const subscriptions = await stripe.subscriptions.list({
        customer: stripeUserId,
        status: "active",
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const subscription = await stripe.subscriptions.create({
          customer: stripeUserId,
          items: [{ price: priceId }],
          expand: ["latest_invoice.payment_intent"],
          payment_behavior: "default_incomplete",
        });

        if (subscription.status === "active") {
          res.status(200).json({
            message: { subscriptionId: subscription.id, subscriptions },
          });
        } else if (subscription.status === "incomplete") {
          await cancelSubscription({
            userId: req.userId,
            subscriptionName: null,
            subscriptionId: subscription.id,
          });

          const session = await stripe.checkout.sessions.create({
            customer: stripeUserId,
            payment_method_types: ["card"],
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: redirectUrl,
            cancel_url: cancelUrl,
            billing_address_collection: "auto",
          });

          res.status(200).json({ message: { redirectUrl: session.url } });
        }
      } else {
        const plans = await doWithRetries(async () =>
          db.collection("Plan").find().toArray()
        );

        const relatedPlan = plans.find((plan) => plan.priceId === priceId);

        if (relatedPlan) {
          updateAnalytics({
            userId: req.userId,
            incrementPayload: {
              [`overview.subscription.added.${relatedPlan.name}`]: 1,
            },
          });
        }

        const session = await stripe.checkout.sessions.create({
          billing_address_collection: "auto",
          payment_method_types: ["card"],
          mode: "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: redirectUrl,
          cancel_url: cancelUrl,
          customer: stripeUserId,
        });

        res.status(200).json({ message: { redirectUrl: session.url } });
      }
    } catch (err) {
      next(err);
    }
  }
);

export default route;
