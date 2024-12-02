import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router } from "express";
import { ClubDataType, CustomRequest } from "types.js";
import { db, stripe } from "init.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.post("/", async (req: CustomRequest, res) => {
  const { redirectUrl } = req.body;
  try {
    const userInfo = (await db
      .collection("User")
      .findOne(
        { _id: new ObjectId(req.userId) },
        { projection: { "club.payouts.connectId": 1 } }
      )) as unknown as { club: ClubDataType | null };

    if (!userInfo) throw new Error(`User ${req.userId} not found`);

    const { club } = userInfo || {};
    const { payouts } = club || {};
    const { connectId } = payouts || {};

    if (!connectId) throw new Error(`User ${req.userId} not onboarded`);

    const account = await stripe.accounts.retrieve(connectId);

    if (!account.details_submitted) {
      // The account hasn't completed onboarding
      const accountLink = await stripe.accountLinks.create({
        account: connectId,
        refresh_url: redirectUrl || `${process.env.CLIENT_URL}/club`,
        return_url: redirectUrl || `${process.env.CLIENT_URL}/club`,
        type: "account_onboarding",
      });

      res.status(200).json({ message: accountLink.url });
    } else {
      // The account has completed onboarding
      const loginLink = await stripe.accounts.createLoginLink(connectId);
      res.status(200).json({ message: loginLink.url });
    }
  } catch (error) {
    addErrorLog({
      functionName: "redirectToWallet",
      message: error.message,
    });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
