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
  "/:followingUserName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserName } = req.params;
    const { filter, projection } = aqp(req.query);
    const { query } = filter || {};

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

      pipeline.push(
        {
          $match: {
            ...match,
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
