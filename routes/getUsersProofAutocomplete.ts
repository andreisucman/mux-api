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
  "/:userId?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const { filter } = aqp(req.query);
    const { query } = filter || {};

    if (userId) {
      await checkTrackedRBAC({ followingUserId: userId, userId: req.userId });
    }

    let finalUserId = userId || req.userId;

    if (!finalUserId) {
      res.status(400).json({ error: "Bad request" });
    }

    try {
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
          $project: {
            taskName: 1,
            concern: 1,
            type: 1,
            part: 1,
          },
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
