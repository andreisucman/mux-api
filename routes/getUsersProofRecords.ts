import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:followingUserId?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserId } = req.params;
    const { filter, skip } = aqp(req.query);
    const { routineId, taskKey, concern, type, part, query, ...otherFilters } =
      filter || {};

    const finalUserId = followingUserId || req.userId;

    if (!ObjectId.isValid(finalUserId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      if (followingUserId) {
        const { inClub, isFollowing } = await checkTrackedRBAC({
          userId: req.userId,
          followingUserId,
        });

        if (!inClub || !isFollowing) {
          res.status(200).json({ message: [] });
          return;
        }
      }

      const pipeline: any = [];

      if (query) {
        pipeline.push({
          $text: {
            $search: `"${query}"`,
            $caseSensitive: false,
            $diacriticSensitive: false,
          },
        });
      }

      let finalFilters: { [key: string]: any } = {
        userId: new ObjectId(followingUserId || req.userId),
      };

      if (routineId) {
        finalFilters.routineId = new ObjectId(routineId);
      }

      if (taskKey) {
        finalFilters.taskKey = taskKey;
      }

      if (concern) finalFilters.concern = concern;
      if (type) finalFilters.type = type;
      if (part) finalFilters.part = part;

      if (otherFilters) {
        finalFilters = { ...finalFilters, isPublic: true };
      }

      pipeline.push({ $match: finalFilters });

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
