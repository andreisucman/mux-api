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
  "/:trackedUserId?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { trackedUserId } = req.params;

    let userId = trackedUserId || req.userId;

    if (trackedUserId) {
      await checkTrackedRBAC({
        trackedUserId,
        userId: req.userId,
      });
    }

    try {
      const response =
        (await doWithRetries(async () =>
          db
            .collection("StyleVote")
            .aggregate([
              {
                $match: {
                  userId: new ObjectId(userId),
                },
              },
              {
                $group: {
                  _id: null,
                  styleNames: { $addToSet: "$styleName" },
                },
              },
              {
                $project: {
                  styleNames: 1,
                  _id: 0,
                },
              },
            ])
            .next()
        )) || {};

      res.status(200).json({ message: response.styleNames || [] });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
