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

    let userId = followingUserId || req.userId;

    if (followingUserId) {
      await checkTrackedRBAC({
        followingUserId,
        userId: req.userId,
      });
    }

    const match: { [key: string]: any } = {
      $match: {
        userId: new ObjectId(userId),
      },
    };

    if (type) {
      match.type = type;
    }

    try {
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
