import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { db, stripe } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userInfo = await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              "club.payouts.connectId": 1,
              "club.payouts.balance": 1,
              "club.payouts.payoutsEnabled": 1,
            },
          }
        )
      );

      const { club } = userInfo;
      const { payouts } = club || {};
      const { connectId, balance, payoutsEnabled } = payouts;

      if (!payoutsEnabled) {
        res.status(200).json({
          error:
            "Your payouts are disabled. Please login into your wallet and complete the necessary requirements.",
        });
        return;
      }

      if (balance === 0) {
        res.status(200).json({
          error:
            "Your balance is zero. To see the the payout history login to your wallet.",
        });
        return;
      }

      const stripeBalance = await doWithRetries(async () =>
        stripe.balance.retrieve({
          stripeAccount: connectId,
        })
      );

      const amount = stripeBalance.available[0]?.amount;
      const currency = stripeBalance.available[0]?.currency;

      await doWithRetries(async () =>
        stripe.payouts.create(
          {
            amount,
            currency,
          },
          { stripeAccount: connectId }
        )
      );

      res.status(200).json({
        message: `Withdrawal initiated. Check your wallet for details.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
