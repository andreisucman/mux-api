import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, SubscriptionTypeNamesEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkSubscriptionStatus from "functions/checkSubscription.js";
import getUserInfo from "@/functions/getUserInfo.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserName } = req.body;

    if (!followingUserName) {
      res.status(400).json({
        message: "Bad request",
      });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { name: 1, "club.followingUserName": 1 },
      });

      const isValid = await checkSubscriptionStatus({
        userId: req.userId,
        subscriptionType: SubscriptionTypeNamesEnum.PEEK,
      });

      if (!isValid) {
        res.status(200).json({ error: "subscription expired" });
        return;
      }

      const newFollowingInfo = await getUserInfo({
        userId: req.userId,
        projection: {
          "club.privacy": 1,
          avatar: 1,
          name: 1,
        },
      });

      if (!newFollowingInfo) httpError(`User not found - ${newFollowingInfo}`);

      const {
        club: followingClub,
        avatar,
        name,
        _id: newFollowingUserId,
      } = newFollowingInfo;
      const { privacy } = followingClub;

      const allPartPrivacies = privacy.flatMap((typePrivacy) =>
        typePrivacy.parts.map((partPrivacy) => partPrivacy.value)
      );

      const allPrivate = allPartPrivacies.every((value) => !Boolean(value));

      if (allPrivate) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const { club } = userInfo || {};
      const { followingUserName: oldFollowingUserName } = club;

      const userUpdates = [
        {
          updateOne: {
            filter: { _id: new ObjectId(req.userId) },
            update: {
              $set: {
                "club.followingUserName": followingUserName,
                "club.followingUserId": newFollowingUserId,
              },
            },
          },
        },
        {
          updateOne: {
            filter: { name: oldFollowingUserName },
            update: {
              $set: { $inc: { "club.totalFollowers": -1 } },
            },
          },
        },
        {
          updateOne: {
            filter: { name: followingUserName },
            update: {
              $set: { $inc: { "club.totalFollowers": 1 } },
            },
          },
        },
      ];

      await doWithRetries(async () =>
        db.collection("User").bulkWrite(userUpdates)
      );

      await doWithRetries(async () =>
        db.collection("FollowHistory").updateOne(
          { _id: new ObjectId(req.userId) },
          {
            $set: {
              followingUserName,
              userName: name,
              avatar,
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
