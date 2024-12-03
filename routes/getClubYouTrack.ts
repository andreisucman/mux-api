import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import { GetClubYouTrackUserType } from "types/getClubYouTrackTypes.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.get("/:trackedUserId", async (req: CustomRequest, res: Response) => {
  const { trackedUserId } = req.params;

  try {
    if (!trackedUserId || !ObjectId.isValid(trackedUserId))
      throw new Error("Invaid userId");

    const projection: { [key: string]: number } = {
      _id: 1,
      "club.name": 1,
      "club.privacy": 1,
      "club.avatar": 1,
      latestScores: 1,
      latestScoresDifference: 1,
    };

    if (req.userId) {
      projection["club.bio"] = 1;
    } else {
      projection["club.bio.intro"] = 1;
    }

    const userInfo = (await doWithRetries({
      functionName: "getClubYouTrack",
      functionToExecute: async () =>
        db.collection("User").findOne(
          { _id: new ObjectId(trackedUserId) },
          {
            projection,
          }
        ),
    })) as unknown as GetClubYouTrackUserType;

    if (!userInfo) throw new Error(`User ${trackedUserId} not found`);

    const { _id, club, latestScores, latestScoresDifference } = userInfo;
    const { name, avatar, bio, privacy } = club;

    const result: { [key: string]: any } = {
      _id,
      name,
      avatar,
      bio,
      scores: {},
    };

    const anyPartInHeadEnabled = privacy
      .find((typePrivacy) => typePrivacy.name === "head")
      .parts.some((part) => part.value);

    const anyPartInBodyEnabled = privacy
      .find((typePrivacy) => typePrivacy.name === "body")
      .parts.some((part) => part.value);

    if (anyPartInHeadEnabled) {
      result.scores.headCurrentScore = latestScores.head.overall;
      result.scores.headTotalProgress = latestScoresDifference.head.overall;
    }

    if (anyPartInBodyEnabled) {
      result.scores.bodyCurrentScore = latestScores.body.overall;
      result.scores.bodyTotalProgress = latestScoresDifference.body.overall;
    }

    if (Object.keys(result.scores).length === 0) result.scores = null;

    res.status(200).json({ message: result });
  } catch (error) {
    addErrorLog({ functionName: "getClubYouTrack", message: error.message });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
