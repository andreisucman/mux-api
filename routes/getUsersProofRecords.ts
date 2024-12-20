import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { ContentModerationStatusEnum } from "types.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:followingUserName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserName } = req.params;
    const { filter, skip } = aqp(req.query);
    const { routineId, taskKey, concern, type, part, query, ...otherFilters } =
      filter || {};

    if (!followingUserName && !req.userId) {
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

      const pipeline: any = [];

      let match: { [key: string]: any } = {};

      if (query) {
        match.$text = {
          $search: `"${query}"`,
          $caseSensitive: false,
          $diacriticSensitive: false,
        };
      }

      if (followingUserName) {
        match.name = followingUserName;
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

      if (otherFilters) {
        match = {
          ...match,
          isPublic: true,
          moderationStatus: ContentModerationStatusEnum.ACTIVE,
        };
      }

      pipeline.push({ $match: match });

      if (skip) {
        pipeline.push({ $skip: skip });
      }

      pipeline.push({ $sort: { createdAt: -1 } }, { $limit: 21 });

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
