import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

const collectionMap: { [key: string]: string } = {
  progress: "Progress",
  style: "StyleAnalysis",
  proof: "Proof",
};

route.get(
  "/:followingUserId?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserId } = req.params;
    const { filter, projection } = aqp(req.query);
    const { collection, type } = filter;

    let finalUserId = followingUserId || req.userId;

    if (!collection || !ObjectId.isValid(finalUserId)) {
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
        userId: new ObjectId(finalUserId),
      };

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
