import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import { db, stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import getSubscriptionPriceId from "./getSubscriptionPriceId.js";
import formatAmountForStripe from "@/helpers/formatAmountForStripe.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { dataId, redirectUrl, cancelUrl, mode } = req.body;

    if (
      !dataId ||
      !redirectUrl ||
      !cancelUrl ||
      !mode ||
      !["subscription", "payment"].includes(mode)
    ) {
      res.status(400).json("Bad request");
      return;
    }

    try {
      const routineInfo = await doWithRetries(() =>
        db
          .collection("RoutineData")
          .findOne(
            { _id: new ObjectId(dataId) },
            { projection: { price: 1, name: 1, description: 1, userId: 1 } }
          )
      );

      if (!routineInfo) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const {
        price,
        name,
        description,
        userId: sellerId,
        _id: routineDataId,
      } = routineInfo;

      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { stripeUserId: 1 },
      });

      const { stripeUserId } = userInfo;

      const sellerInfo = await getUserInfo({
        userId: sellerId,
        projection: { "club.payouts.connectId": 1 },
      });

      const { club } = sellerInfo;
      const { payouts } = club;
      const { connectId: sellerConnectId } = payouts;

      const feeAmount = formatAmountForStripe(
        Number(process.env.PLATFORM_FEE_PERCENT) * price,
        "usd"
      );

      if (mode === "payment") {
        const session = await stripe.checkout.sessions.create({
          customer: stripeUserId,
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name,
                  description,
                },
                unit_amount: formatAmountForStripe(price, "usd"),
              },
              quantity: 1,
            },
          ],
          metadata: { routineDataId: String(routineDataId) },
          payment_intent_data: {
            transfer_data: {
              destination: sellerConnectId,
            },
            application_fee_amount: feeAmount,
          },
          success_url: redirectUrl,
          cancel_url: cancelUrl,
          billing_address_collection: "auto",
        });

        if (session.url) {
          updateAnalytics({
            userId: req.userId,
            incrementPayload: {
              [`overview.payment.checkout.oneTime`]: 1,
            },
          });
        }

        res.status(200).json({ message: { redirectUrl: session.url } });
        return;
      }

      const priceId = await getSubscriptionPriceId({
        name,
        amount: price,
      });

      const session = await stripe.checkout.sessions.create({
        customer: stripeUserId,
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: { routineDataId: String(routineDataId) },
        subscription_data: {
          application_fee_percent: Number(process.env.PLATFORM_FEE_PERCENT),
          transfer_data: {
            destination: sellerConnectId,
          },
        },
        success_url: redirectUrl,
        cancel_url: cancelUrl,
        billing_address_collection: "auto",
      });

      updateAnalytics({
        userId: req.userId,
        incrementPayload: {
          [`overview.payment.checkout.update`]: 1,
        },
      });

      res.status(200).json({ message: { redirectUrl: session.url } });

      return;
    } catch (err) {
      next(err);
    }
  }
);

export default route;
