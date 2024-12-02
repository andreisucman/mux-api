import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import formatAmountForStripe from "helpers/formatAmountForStripe.js";
import addErrorLog from "functions/addErrorLog.js";
import { CustomRequest } from "types.js";
import { db, stripe } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  try {
    const userInfo = await doWithRetries({
      functionName: "withrawReward",
      functionToExecute: async () =>
        db.collection("User").findOne(
          { _id: new ObjectId(req.userId) },
          {
            projection: {
              "club.payouts.connectId": 1,
              "club.payouts.rewardEarned": 1,
            },
          }
        ),
    });

    if (!userInfo || !userInfo.connectId) {
      res.status(200).json({
        error: "Please contact us at info@muxout.com.",
      });
      addErrorLog({
        functionName: "withdrawReward",
        message: `User ${req.userId} or Stripe account not found`,
      });
      return;
    }

    const { club } = userInfo;
    const { payouts } = club || {};
    const { connectId, rewardEarned, payoutsEnabled } = payouts;

    if (!payoutsEnabled) {
      res.status(200).json({
        error:
          "Your payouts are disabled. Please login into your wallet to complete the necessary requirements for enabling payouts.",
      });
      return;
    }

    if (rewardEarned === 0) {
      res.status(200).json({ error: "Your balance is zero." });
      return;
    }

    await doWithRetries({
      functionName: "withdrawReward - transfer",
      functionToExecute: async () =>
        stripe.transfers.create({
          currency: "usd",
          destination: connectId,
          amount: formatAmountForStripe(rewardEarned, "usd"),
        }),
    });

    await doWithRetries({
      functionName: "withrawReward - update user",
      functionToExecute: async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(req.userId) },
            { $set: { "club.payouts.rewardEarned": 0 } }
          ),
    });

    res.status(200).json({
      message: `You have initiated a withdrawal of $${rewardEarned} to your wallet.`,
    });
  } catch (error) {
    addErrorLog({
      functionName: "withdrawReward",
      message: error.message,
    });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
