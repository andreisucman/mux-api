import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import doWithRetries from "@/helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { stripe } from "@/init.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: {
          "club.payouts.connectId": 1,
          "club.payouts.payoutsEnabled": 1,
        },
      });

      const { club } = userInfo || {};
      const { payouts } = club || {};
      const { connectId, payoutsEnabled } = payouts || {};

      if (!connectId) return;

      const accountSession = await doWithRetries(() =>
        stripe.accountSessions.create({
          account: connectId,
          components: {
            balances: {
              enabled: payoutsEnabled,
              features: {
                instant_payouts: true,
                standard_payouts: true,
              },
            },
          },
        } as any)
      );

      res.status(200).json({ message: accountSession.client_secret });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
