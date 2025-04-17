import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import formatDate from "helpers/formatDate.js";
import { daysFrom } from "helpers/utils.js";
import { db, stripe } from "init.js";
import checkRewardCompletion from "@/helpers/checkRewardRequirement.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import findLatestRewards from "@/functions/findLatestRewards.js";
import formatAmountForStripe from "@/helpers/formatAmountForStripe.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { rewardId } = req.body;

  if (!ObjectId.isValid(rewardId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const cooldownObject = await doWithRetries(async () =>
      db.collection("RewardCooldown").findOne(
        {
          userId: new ObjectId(req.userId),
          rewardId: new ObjectId(rewardId),
        },
        { projection: { availableFrom: 1 } }
      )
    );

    const { availableFrom } = cooldownObject || { availableFrom: null };

    if (availableFrom) {
      if (new Date() < new Date(availableFrom)) {
        const formattedDate = formatDate({
          date: availableFrom,
        });

        res.status(200).json({
          error: `You have already claimed this reward. Try again after ${formattedDate}.`,
        });

        return;
      }
    }

    const relevantReward = await doWithRetries(async () =>
      db
        .collection("Reward")
        .findOne({ _id: new ObjectId(rewardId) }, { projection: { requisite: 1, value: 1, key: 1, sign: 1 } })
    );

    if (!relevantReward) throw httpError(`Reward ${rewardId} not found`);

    const { requisite, value: rewardValue, key: rewardKey, sign } = relevantReward;

    const userInfo = await getUserInfo({
      userId: req.userId,
    });

    if (!userInfo) throw httpError(`User not found`);

    if (!userInfo.club) {
      res.status(200).json({
        error: `no club`,
      });
      return;
    }

    if (!userInfo.club.payouts.connectId) {
      res.status(200).json({
        error: `no bank`,
      });
      return;
    }

    const completionPercentage = checkRewardCompletion(userInfo, requisite, sign);

    if (Number(completionPercentage) < 100) {
      res.status(200).json({
        error: `This task is not completed.`,
      });
      return;
    }

    const connectId = userInfo.club.payouts.connectId;

    const formattedAmount = formatAmountForStripe(rewardValue, "usd");

    await stripe.transfers.create({
      amount: formattedAmount,
      currency: "usd",
      destination: connectId,
    });

    await doWithRetries(async () =>
      db.collection("RewardCooldown").updateOne(
        {
          userId: new ObjectId(req.userId),
          rewardId: new ObjectId(rewardId),
        },
        { $set: { availableFrom: daysFrom({ days: 30 }) } },
        { upsert: true }
      )
    );

    await doWithRetries(async () =>
      db.collection("Reward").updateOne(
        {
          _id: new ObjectId(rewardId),
          left: { $gt: 0 },
        },
        { $inc: { left: -1 } }
      )
    );

    updateAnalytics({
      userId: String(userInfo._id),
      incrementPayload: {
        "accounting.totalReward": rewardValue,
        "overview.accounting.totalReward": rewardValue,
        [`overview.usage.rewards.${rewardKey}`]: 1,
      },
    });

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(userInfo._id),
        },
        { $inc: { netBenefit: rewardValue * -1 } }
      )
    );

    const rewards = await findLatestRewards({ userId: req.userId });

    res.status(200).json({
      message: rewards,
    });
  } catch (err) {
    next(err);
  }
});

export default route;
