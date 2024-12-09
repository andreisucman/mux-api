import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { ClubDataType, CustomRequest, PrivacyType } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkSubscriptionStatus from "functions/checkSubscription.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserId } = req.body;

    if (!followingUserId || !ObjectId.isValid(followingUserId)) {
      res.status(400).json({
        message: "Bad request",
      });
      return;
    }

    if (followingUserId === req.userId) {
      res.status(400).json({
        message: "Bad request",
      });
      return;
    }

    try {
      const isValid = await checkSubscriptionStatus({
        userId: req.userId,
        subscriptionType: "club",
      });

      if (!isValid) {
        res.status(200).json({ error: "subscription expired" });
        return;
      }

      const newFollowingInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          { _id: new ObjectId(followingUserId) },
          {
            projection: {
              "club.privacy": 1,
              "club.avatar": 1,
              "club.name": 1,
            },
          }
        )
      )) as unknown as {
        club: {
          privacy: PrivacyType[];
          avatar: { [key: string]: any };
          name: string;
        };
      };

      if (!newFollowingInfo) httpError(`User not found - ${followingUserId}`);

      const { club: followingClub } = newFollowingInfo;
      const { privacy, avatar, name } = followingClub;

      const allPartPrivacies = privacy.flatMap((typePrivacy) =>
        typePrivacy.parts.map((partPrivacy) => partPrivacy.value)
      );

      const allPrivate = allPartPrivacies.every((value) => !Boolean(value));

      if (allPrivate) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          { _id: new ObjectId(req.userId) },
          {
            projection: {
              "club.followingUserId": 1,
            },
          }
        )
      )) as unknown as { club: ClubDataType };
      const { club } = userInfo || {};
      const { followingUserId: oldFollowingUserId } = club;

      const userUpdates = [
        {
          updateOne: {
            filter: { _id: new ObjectId(req.userId) },
            update: {
              $set: { "club.followingUserId": new ObjectId(followingUserId) },
            },
          },
        },
        {
          updateOne: {
            filter: { _id: new ObjectId(oldFollowingUserId) },
            update: {
              $set: { $inc: { "club.totalFollowers": -1 } },
            },
          },
        },
        {
          updateOne: {
            filter: { _id: new ObjectId(followingUserId) },
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
              followingUserId: new ObjectId(followingUserId),
              name,
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
