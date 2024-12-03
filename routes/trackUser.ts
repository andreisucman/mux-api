import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, PrivacyType } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkSubscriptionStatus from "functions/checkSubscription.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { trackedUserId } = req.body;

    if (!trackedUserId || !ObjectId.isValid(trackedUserId)) {
      res.status(400).json({
        message: "Bad request",
      });
      return;
    }

    if (trackedUserId === req.userId) {
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

      const userInfo = (await doWithRetries({
        functionName: "trackUser - get user info",
        functionToExecute: async () =>
          db.collection("User").findOne(
            { _id: new ObjectId(trackedUserId) },
            {
              projection: {
                "club.privacy": 1,
                "club.avatar": 1,
                "club.name": 1,
              },
            }
          ),
      })) as unknown as {
        club: {
          privacy: PrivacyType[];
          avatar: { [key: string]: any };
          name: string;
        };
      };

      if (!userInfo) httpError(`User not found - ${trackedUserId}`);

      const { club } = userInfo;
      const { privacy, avatar, name } = club;

      const allPartPrivacies = privacy.flatMap((typePrivacy) =>
        typePrivacy.parts.map((partPrivacy) => partPrivacy.value)
      );

      const allPrivate = allPartPrivacies.every((value) => !Boolean(value));

      if (allPrivate) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      await doWithRetries({
        functionName: "trackUser",
        functionToExecute: async () =>
          db
            .collection("User")
            .updateOne(
              { _id: new ObjectId(req.userId) },
              { $set: { "club.trackedUserId": trackedUserId } }
            ),
      });

      await doWithRetries({
        functionName: "trackUser",
        functionToExecute: async () =>
          db
            .collection("FollowHistory")
            .updateOne(
              { _id: new ObjectId(req.userId) },
              { $set: { trackedUserId, name, avatar, updatedAt: new Date() } },
              { upsert: true }
            ),
      });

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
