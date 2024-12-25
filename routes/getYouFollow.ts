import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { GetYouFollowUserType } from "@/types/getYouFollowTypes.js";
import { ClubBioType, CustomRequest, UserType } from "types.js";
import checkTrackedRBAC from "@/functions/checkTrackedRBAC.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get(
  "/:followingUserName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserName } = req.params;

    if (!followingUserName) {
      res.status(200).json({ message: null });
      return;
    }

    try {
      const projection: { [key: string]: number } = {
        _id: 1,
        name: 1,
        avatar: 1,
        "club.privacy": 1,
        "club.bio": 1,
        latestScores: 1,
        latestScoresDifference: 1,
      };

      let userInfo: Partial<UserType> = {};

      if (followingUserName) {
        const rbacResponse = await checkTrackedRBAC({
          followingUserName,
          userId: req.userId,
          targetProjection: projection,
        });

        userInfo = rbacResponse.targetUserInfo;

        const { isFollowing, subscriptionActive } = rbacResponse;

        if (!isFollowing || !subscriptionActive) {
          const { club } = userInfo || {};

          if (club) {
            const newBio = Object.keys(club.bio).reduce((a: ClubBioType, c) => {
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
                a[c as "intro"] = club.bio[c];
              }
              return a;
            }, {} as ClubBioType);

            userInfo.club.bio = newBio;
          }
        }
      }

      if (!userInfo) throw httpError(`User ${followingUserName} not found`);

      const { _id, club, name, avatar, latestScores, latestScoresDifference } =
        userInfo as GetYouFollowUserType;

      const { bio, privacy } = club;

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
