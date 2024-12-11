import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:followingUserId?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserId } = req.params;
    const { type } = req.query;

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
          res.status(200).json({ message: { styleNames: [] } });
          return;
        }
      }

      const match: { [key: string]: any } = {
        $match: {
          userId: new ObjectId(finalUserId),
        },
      };

      if (type) {
        match.type = type;
      }

      const response = await doWithRetries(async () =>
        db
          .collection("StyleAnalysis")
          .aggregate([
            match,
            {
              $group: {
                _id: null,
                styleName: { $addToSet: "$styleName" },
              },
            },
            {
              $project: {
                styleName: 1,
                _id: 0,
              },
            },
          ])
          .next()
      );

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
