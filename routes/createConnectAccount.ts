import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db, stripe } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { ConnectParamsType } from "types/createConnectAccountTypes.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { email: 1, country: 1, name: 1, "club.payouts": 1 },
      });

      const { email, club, country, name } = userInfo;
      const { payouts } = club || {};
      let { connectId } = payouts || {};

      if (!connectId) {
        const params: ConnectParamsType = {
          type: "express",
          business_type: "individual",
          individual: {
            email,
          },
          country: country?.toUpperCase(),
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: false },
          },
          business_profile: {
            mcc: "5734",
            url: `https://muxout.com/club/${name}`,
          },
          settings: {
            payments: {
              statement_descriptor: "MUXOUT REWARD",
            },
          },
        };

        const account = await stripe.accounts.create(params as any);

        const accLink = await stripe.accountLinks.create({
          account: account.id,
          return_url: process.env.CLIENT_URL + "/club/admission",
          refresh_url: process.env.CLIENT_URL + "/club/admission",
          type: "account_onboarding",
        });

        await doWithRetries(async () =>
          db.collection("User").updateOne(
            {
              _id: new ObjectId(req.userId),
              moderationStatus: ModerationStatusEnum.ACTIVE,
            },
            { $set: { "club.payouts.connectId": account.id } }
          )
        );

        updateAnalytics({ [`dashboard.club.country.${country}`]: 1 });

        res.status(200).json({ message: accLink.url });
        return;
      } else {
        const account = await stripe.accounts.retrieve(connectId);

        if (!account.details_submitted) {
          const accLink = await stripe.accountLinks.create({
            account: connectId,
            return_url: process.env.CLIENT_URL + "/club/admission",
            refresh_url: process.env.CLIENT_URL + "/club/admission",
            type: "account_onboarding",
          });
          res.status(200).json({ message: accLink.url });
          return;
        } else {
          const loginLink = await stripe.accounts.createLoginLink(connectId);
          res.status(200).json({ message: loginLink.url });
          return;
        }
      }
    } catch (err) {
      next(err);
    }
  }
);

export default route;
