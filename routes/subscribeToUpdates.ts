import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import { db, stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import getSubscriptionPriceId from "../functions/getSubscriptionPriceId.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { sellerId, part, concern, redirectUrl, cancelUrl } = req.body;

  if (!ObjectId.isValid(sellerId) || !part || !concern || !redirectUrl || !cancelUrl) {
    res.status(400).json("Bad request");
    return;
  }

  try {
    const routineData = await doWithRetries(() =>
      db.collection("RoutineData").findOne(
        { userId: new ObjectId(sellerId), part, concern },
        {
          projection: {
            updatePrice: 1,
            userId: 1,
            name: 1,
            status: 1,
            userName: 1,
          },
        }
      )
    );

    if (!routineData) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const { updatePrice, status, userName } = routineData;

    if (status !== "public") {
      res.status(200).json({ error: "The seller has disabled updates." });
      return;
    }

    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { stripeUserId: 1 },
    });

    const { stripeUserId } = userInfo;

    const sellerInfo = await getUserInfo({
      userId: sellerId,
      projection: { "club.payouts.connectId": 1, country: 1 },
    });

    const { club, country } = sellerInfo;
    const { payouts } = club;
    const { connectId: sellerConnectId } = payouts;

    const metadata = {
      routineDataId: String(routineData._id),
      sellerId: String(sellerId),
    };

    const description = `Subscribe to routine, progress, proof and diary updates as the ${userName} uploads them.`;

    const priceId = await getSubscriptionPriceId({
      amount: updatePrice,
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
      subscription_data: {
        description,
        metadata,
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
});

export default route;
