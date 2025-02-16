import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId, Sort } from "mongodb";
import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { ModerationStatusEnum } from "types.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:followingUserName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserName } = req.params;
    const { filter, skip, sort } = aqp(req.query as any) as AqpQuery;
    const { routineId, taskKey, concern, type, part, query } = filter || {};

    if (!followingUserName && !req.userId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const match: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      if (followingUserName) {
        const { inClub, isFollowing, isSelf, subscriptionActive } =
          await checkTrackedRBAC({
            userId: req.userId,
            followingUserName,
          });

        if ((!inClub || !isFollowing || !subscriptionActive) && !isSelf) {
          res.status(200).json({ message: [] });
          return;
        }

        if (!isSelf) {
          match.isPublic = true;
        }
      }

      const pipeline: any = [];

      if (query) {
        match.$text = {
          $search: `"${query}"`,
          $caseSensitive: false,
          $diacriticSensitive: false,
        };
      }

      if (followingUserName) {
        match.userName = followingUserName;
      } else {
        match.userId = new ObjectId(req.userId);
      }

      if (routineId) {
        match.routineId = new ObjectId(routineId);
      }

      if (taskKey) {
        match.taskKey = taskKey;
      }

      if (concern) match.concern = concern;
      if (type) match.type = type;
      if (part) match.part = part;

      pipeline.push(
        {
          $match: match,
        },
        { $sort: (sort as Sort) || { createdAt: -1 } }
      );

      if (skip) {
        pipeline.push({ $skip: skip });
      }

      pipeline.push({ $limit: 21 });

      const proof = await doWithRetries(async () =>
        db.collection("Proof").aggregate(pipeline).toArray()
      );

      res.status(200).json({ message: proof });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
