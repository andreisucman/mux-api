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
    const { filter, projection } = aqp(req.query);
    const { query } = filter || {};

    let finalUserId = followingUserId || req.userId;

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

      if (!finalUserId) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const pipeline: any = [];

      let match: { [key: string]: any } = {};

      if (query) {
        match = {
          $text: {
            $search: `"${query}"`,
            $caseSensitive: false,
            $diacriticSensitive: false,
          },
        };
      }

      pipeline.push(
        {
          $match: {
            ...match,
            userId: new ObjectId(finalUserId),
            isPublic: true,
          },
        },
        {
          $project: projection,
        }
      );

      const autocompleteData = await doWithRetries(async () =>
        db.collection("Proof").aggregate(pipeline).toArray()
      );

      res.status(200).json({ message: autocompleteData });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
