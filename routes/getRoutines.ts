import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId, Sort } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { CustomRequest, SubscriptionTypeNamesEnum } from "types.js";
import checkSubscriptionStatus from "@/functions/checkSubscription.js";
import aqp, { AqpQuery } from "api-query-params";
import { db } from "init.js";

const route = Router();

route.get(
  "/:followingUserName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserName } = req.params;
    const { skip, sort = {} } = aqp(req.query as any) as AqpQuery;

    try {
      if (followingUserName) {
        const { inClub, isSelf, isFollowing, subscriptionActive } =
          await checkTrackedRBAC({
            userId: req.userId,
            followingUserName,
          });

        if ((!inClub || !isFollowing || !subscriptionActive) && !isSelf) {
          res.status(200).json({ message: [] });
          return;
        }

        const isSubscriptionValid = await checkSubscriptionStatus({
          userId: req.userId,
          subscriptionType: SubscriptionTypeNamesEnum.PEEK,
        });

        if (!isSubscriptionValid && !isSelf) {
          res.status(200).json({
            error: "subscription expired",
          });
          return;
        }
      }

      const filter: { [key: string]: any } = {};

      if (followingUserName) {
        filter.userName = followingUserName;
      } else {
        filter.userId = new ObjectId(req.userId);
      }

      const projection = {
        _id: 1,
        startsAt: 1,
        part: 1,
        allTasks: 1,
        status: 1,
        lastDate: 1,
      };

      const routines = await doWithRetries(async () =>
        db
          .collection("Routine")
          .aggregate([
            { $match: filter },
            { $project: projection },
            { $sort: { status: 1, ...(sort || { createdAt: -1 }) } },
            { $skip: Number(skip) || 0 },
            { $limit: 21 },
          ])
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
