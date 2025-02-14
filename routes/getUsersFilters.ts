import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { ModerationStatusEnum, CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

const collectionMap: { [key: string]: string } = {
  progress: "Progress",
  proof: "Proof",
};

route.get(
  "/:followingUserName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserName } = req.params;
    const { filter, projection } = aqp(req.query as any) as AqpQuery;
    const { collection, type } = filter;

    if (!collection || (!followingUserName && !req.userId)) {
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
          res.status(200).json({ message: null });
          return;
        }
      }

      const fields = Object.keys(projection);

      const groupParams = fields.reduce((a: { [key: string]: any }, c) => {
        a[c] = { $addToSet: `$${c}` };
        return a;
      }, {});

      const match: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      if (followingUserName) {
        match.userName = followingUserName;
      } else {
        match.userId = new ObjectId(req.userId);
      }

      if (type) match.type = type;

      const filters = await doWithRetries(async () =>
        db
          .collection(collectionMap[collection])
          .aggregate([
            {
              $match: match,
            },
            {
              $group: {
                _id: null,
                ...groupParams,
              },
            },
            {
              $project: {
                _id: 0,
                ...projection,
              },
            },
          ])
          .next()
      );

      res.status(200).json({ message: filters });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
