import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { GetClubYouTrackUserType } from "types/getClubYouTrackTypes.js";
import { ClubBioType, CustomRequest, UserType } from "types.js";
import checkTrackedRBAC from "@/functions/checkTrackedRBAC.js";

const route = Router();

route.get(
  "/:followingUserId",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserId } = req.params;

    if (!followingUserId || !ObjectId.isValid(followingUserId)) {
      res.status(400).json({ error: "Invaid userId" });
      return;
    }

    try {
      const projection: { [key: string]: number } = {
        _id: 1,
        "club.name": 1,
        "club.privacy": 1,
        "club.avatar": 1,
        "club.bio": 1,
        latestScores: 1,
        latestScoresDifference: 1,
      };

      let userInfo: Partial<UserType> = {};

      if (followingUserId) {
        const rbacResponse = await checkTrackedRBAC({
          followingUserId,
          userId: req.userId,
          targetProjection: projection,
        });

        userInfo = rbacResponse.targetUserInfo;

        if (!rbacResponse.isFollowing) {
          const newBio = Object.keys(userInfo.club.bio).reduce(
            (a: ClubBioType, c) => {
              if (c !== "intro") {
                if (c === "questions") {
                  a[c] = [];
                } else if (c === "socials") {
                  const newSocials = userInfo.club.bio[c].map((item) => ({
                    label: "******",
                    value: "******",
                  }));
                  a[c as "socials"] = newSocials;
                } else {
                  a[c as "intro"] = "";
                }
              } else {
                a[c as "intro"] = userInfo.club.bio[c];
              }
              return a;
            },
            {} as ClubBioType
          );

          userInfo.club.bio = newBio;
        }
      }

      if (!userInfo) throw new Error(`User ${followingUserId} not found`);

      const { _id, club, latestScores, latestScoresDifference } =
        userInfo as GetClubYouTrackUserType;

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
    } catch (err) {
      next(err);
    }
  }
);

export default route;
