import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { CustomRequest } from "types.js";
import addErrorLog from "functions/addErrorLog.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db, stripe } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  try {
    const userInfo = await doWithRetries({
      functionName: "createBillingPortalSession - get user",
      functionToExecute: async () =>
        db
          .collection("User")
          .findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { stripeUserId: 1 } }
          ),
    });

    if (!userInfo) {
      addErrorLog({
        functionName: "createBillingPortalSession",
        message: "No stripeUserId",
      });
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const { stripeUserId } = userInfo;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeUserId,
      return_url: `${process.env.CLIENT_URL}/a`,
    });

    res.status(200).json({ message: portalSession.url });
  } catch (err) {
    addErrorLog({
      functionName: "createBillingPortalSession",
      message: err.message,
    });
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

export default route;
