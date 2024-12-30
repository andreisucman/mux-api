import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { CustomRequest, SubscriptionTypeNamesEnum } from "types.js";
import checkSubscriptionStatus from "@/functions/checkSubscription.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:followingUserName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserName } = req.params;
    const { skip, type } = req.query;

    if (!type) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      if (followingUserName) {
        const { inClub, isFollowing, subscriptionActive } =
          await checkTrackedRBAC({
            userId: req.userId,
            followingUserName,
          });

        if (!inClub || !isFollowing || !subscriptionActive) {
          res.status(200).json({ message: [] });
          return;
        }
      }

      if (followingUserName) {
        const isSubscriptionValid = await checkSubscriptionStatus({
          userName: followingUserName,
          subscriptionType: SubscriptionTypeNamesEnum.PEEK,
        });

        if (!isSubscriptionValid) {
          res.status(200).json({
            error: "subscription expired",
          });
          return;
        }
      }

      const filter: { [key: string]: any } = { type };

      if (followingUserName) {
        filter.name = followingUserName;
      } else {
        filter.userId = new ObjectId(req.userId);
      }

      const projection = { _id: 1, createdAt: 1, allTasks: 1, status: 1 };

      const routines = await doWithRetries(async () =>
        db
          .collection("Routine")
          .find(filter, { projection })
          .sort({ createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(9)
          .toArray()
      );

      res.status(200).json({
        message: routines,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
