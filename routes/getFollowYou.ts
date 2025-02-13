import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { FollowerType } from "@/types/getFollowYouTypes.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip } = req.query;

    try {
      const followers = (await doWithRetries(async () =>
        db
          .collection("User")
          .find(
            {
              "club.followingUserId": new ObjectId(req.userId),
              "subscriptions.peek.validUntil": { $gte: new Date() },
              moderationStatus: ModerationStatusEnum.ACTIVE,
            },
            {
              projection: {
                name: 1,
                avatar: 1,
                latestScores: 1,
                latestScoresDifference: 1,
              },
            }
          )
          .limit(21)
          .skip(Number(skip) || 0)
          .toArray()
      )) as unknown as FollowerType[];

      const results = followers.map((rec) => {
        const { name, avatar, _id, latestScores, latestScoresDifference } = rec;

        const updated = {
          _id,
          name,
          avatar,
          scores: {} as { [key: string]: number },
        };

        updated.scores.currentScore = latestScores.overall;
        updated.scores.totalProgress = latestScoresDifference.overall;

        return updated;
      });

      res.status(200).json({ message: results });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
