import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import formatAmountForStripe from "helpers/formatAmountForStripe.js";
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
            "Your payouts are disabled. Please login into your wallet and complete the necessary requirements for enabling payouts.",
        });
        return;
      }

      if (balance === 0) {
        res.status(200).json({
          error:
            "Your balance is zero. Check your wallet for the payout history.",
        });
        return;
      }

      await doWithRetries(async () =>
        stripe.transfers.create({
          currency: "usd",
          destination: connectId,
          amount: formatAmountForStripe(balance, "usd"),
        })
      );

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $set: { "club.payouts.balance": 0 } }
        )
      );

      res.status(200).json({
        message: `You have initiated a withdrawal of $${balance}. For details check your wallet.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
