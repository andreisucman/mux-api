import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest, PartEnum } from "types.js";
import { db, stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import doWithRetries from "@/helpers/doWithRetries.js";

const route = Router();

const allowedParts = [PartEnum.FACE, PartEnum.HAIR];
const allowedModes = ["subscription", "payment"];

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { priceId, redirectUrl, cancelUrl, part, mode } = req.body;
  if (
    !priceId ||
    !redirectUrl ||
    !cancelUrl ||
    !mode ||
    !allowedModes.includes(mode) ||
    (part && !allowedParts.includes(part))
  ) {
    res.status(400).json("Bad request");
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { stripeUserId: 1, email: 1 },
    });

    let { stripeUserId, email } = userInfo;

    if (!stripeUserId) {
      const stripeUser = await stripe.customers.create({
        email,
      });
      stripeUserId = stripeUser.id;

      await doWithRetries(() => db.collection("User").updateOne({ email }, { $set: { stripeUserId } }));
    }

    const plans = await doWithRetries(async () => db.collection("Plan").find().toArray());

    const relatedPlan = plans.find((plan) => plan.priceId === priceId);

    if (mode === "payment") {
      const session = await stripe.checkout.sessions.create({
        customer: stripeUserId,
        payment_method_types: ["card"],
        metadata: { part },
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: redirectUrl,
        cancel_url: cancelUrl,
        billing_address_collection: "auto",
      });

      if (session.url && relatedPlan) {
        updateAnalytics({
          userId: req.userId,
          incrementPayload: {
            [`overview.user.payment.checkout.platform`]: 1,
          },
        });
      }

      res.status(200).json({ message: { redirectUrl: session.url } });
    }
  } catch (err) {
    next(err);
  }
});

export default route;
