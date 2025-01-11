import * as dotenv from "dotenv";
dotenv.config();

import { Router, NextFunction } from "express";
import { CustomRequest } from "types.js";
import { stripe } from "init.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import doWithRetries from "@/helpers/doWithRetries.js";

const route = Router();

route.post("/", async (req: CustomRequest, res, next: NextFunction) => {
  const { redirectUrl } = req.body;

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { "club.payouts.connectId": 1 },
    });

    if (!userInfo) throw httpError(`User ${req.userId} is not found`);

    const { club } = userInfo || {};
    const { payouts } = club || {};
    const { connectId } = payouts || {};

    if (!connectId) throw httpError(`User ${req.userId} is not onboarded`);

    const account = await doWithRetries(async () =>
      stripe.accounts.retrieve(connectId)
    );

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
  } catch (err) {
    next(err);
  }
});

export default route;
