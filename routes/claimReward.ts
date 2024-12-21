import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import calculateRewardTaskCompletion from "helpers/calculateRewardTaskCompletion.js";
import { CustomRequest, ModerationStatusEnum, UserType } from "types.js";
import formatDate from "helpers/formatDate.js";
import { daysFrom } from "helpers/utils.js";
import { rewardKeyConditionsMap } from "data/rewardKeyConditionsMap.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { rewardId } = req.body;

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
            error: `You have already claimed this reward. Try again after ${formattedDate}`,
          });

          return;
        }
      }

      const relevantReward = await doWithRetries(async () =>
        db
          .collection("Reward")
          .findOne(
            { _id: new ObjectId(rewardId) },
            { projection: { requisite: 1, value: 1, key: 1 } }
          )
      );

      if (!relevantReward) throw httpError(`Reward ${rewardId} not found`);

      const { requisite, value: rewardValue, key: rewardKey } = relevantReward;

      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { streaks: 1 },
      });

      if (!userInfo) throw httpError(`User not found`);

      const userKeyLocations = rewardKeyConditionsMap[rewardKey];

      const userConditions = userKeyLocations.reduce(
        (acc: { [key: string]: number }, cur) => {
          const parts = cur.split(".");
          const lastPart = parts[parts.length - 1];

          const value = parts.reduce(
            (a, key) => (a ? a[key as keyof UserType] : undefined),
            userInfo
          );

          if (typeof value === "number") {
            acc[lastPart] = value;
          }
          return acc;
        },
        {}
      );

      const percentage = calculateRewardTaskCompletion({
        userConditions,
        requisite,
      });

      if (percentage !== 100) {
        res.status(200).json({
          error: `This task is not completed.`,
        });
        return;
      }

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(req.userId), moderationStatus: ModerationStatusEnum.ACTIVE },
            { $inc: { "club.payouts.rewardEarned": rewardValue } }
          )
      );

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
            rewardId: new ObjectId(rewardId),
            left: { $gt: 0 },
          },
          { $inc: { left: -1 } }
        )
      );

      res.status(200).json({
        message: `The reward of $${rewardValue} has been added to your Club balance.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
