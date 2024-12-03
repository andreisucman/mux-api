import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import cancelSubscription from "functions/cancelSubscription.js";
import { CustomRequest } from "types.js";
import { stripe, db } from "init.js";

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
      const userInfo = await doWithRetries(async () =>
        db
          .collection("User")
          .findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { stripeUserId: 1, subscriptions: 1 } }
          )
      );

      const { stripeUserId } = userInfo;

      const subscriptions = await stripe.subscriptions.list({
        customer: stripeUserId,
        status: "active",
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const subscription = await stripe.subscriptions.create({
          customer: userInfo.stripeUserId,
          items: [{ price: priceId }],
          expand: ["latest_invoice.payment_intent"],
          payment_behavior: "default_incomplete",
        });

        if (subscription.status === "active") {
          res.status(200).json({
            message: { subscriptionId: subscription.id, subscriptions },
          });
        } else if (subscription.status === "incomplete") {
          await cancelSubscription(subscription.id);

          const session = await stripe.checkout.sessions.create({
            customer: userInfo.stripeUserId,
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
        const session = await stripe.checkout.sessions.create({
          billing_address_collection: "auto",
          payment_method_types: ["card"],
          mode: "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: redirectUrl,
          cancel_url: cancelUrl,
          customer: userInfo.stripeUserId,
        });
        res.status(200).json({ message: { redirectUrl: session.url } });
      }
    } catch (err) {
      next(err);
    }
  }
);

export default route;
