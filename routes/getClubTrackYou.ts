import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { TrackerType } from "types/getClubTrackYouTypes.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip } = req.query;

    try {
      const trackers = (await doWithRetries(async () =>
        db
          .collection("User")
          .find(
            { "club.followingUserId": new ObjectId(req.userId) },
            {
              projection: {
                "club.bio.intro": 1,
                "club.privacy": 1,
                name: 1,
                avatar: 1,
                latestScores: 1,
                latestScoresDifference: 1,
              },
            }
          )
          .limit(11)
          .skip(Number(skip) || 0)
          .toArray()
      )) as unknown as TrackerType[];

      const results = trackers.map((rec) => {
        const {
          club,
          name,
          avatar,
          latestScores,
          latestScoresDifference,
          _id,
        } = rec;
        const { privacy } = club;

        const updated = {
          _id,
          name,
          avatar,
          scores: {} as { [key: string]: number },
        };

        const anyPartInHeadEnabled = privacy
          .find((typePrivacy) => typePrivacy.name === "head")
          .parts.some((part) => part.value);

        const anyPartInBodyEnabled = privacy
          .find((typePrivacy) => typePrivacy.name === "body")
          .parts.some((part) => part.value);

        if (anyPartInHeadEnabled) {
          updated.scores.headCurrentScore = latestScores.head.overall;
          updated.scores.headTotalProgress =
            latestScoresDifference.head.overall;
        }

        if (anyPartInBodyEnabled) {
          updated.scores.bodyCurrentScore = latestScores.body.overall;
          updated.scores.bodyTotalProgress =
            latestScoresDifference.body.overall;
        }

        return updated;
      });

      res.status(200).json({ message: results });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
