import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import formatDate from "@/helpers/formatDate.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import updateContent from "@/functions/updateContent.js";
import createRandomAvatar from "@/helpers/createAvatar.js";
import createRandomName from "@/functions/createRandomName.js";
import { defaultClubPayoutData } from "@/data/other.js";
import { payoutMinimums } from "@/data/monetization.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userInfo = await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              club: 1,
              country: 1,
              "demographics.ethnicity": 1,
              canRejoinClubAfter: 1,
            },
          }
        )
      );

      if (!userInfo) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const { club, country, canRejoinClubAfter } = userInfo;

      if (club?.isActive) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      if (new Date(canRejoinClubAfter || 0) > new Date()) {
        const rejoinDate = formatDate({ date: canRejoinClubAfter });
        res
          .status(200)
          .json({ error: `You can rejoin the Club after ${rejoinDate}.` });
        return;
      }

      let incrementPayload: { [key: string]: number } = {};
      let clubData = userInfo.club;

      const avatar = createRandomAvatar(userInfo.demographics.ethnicity);
      const name = await createRandomName();

      if (clubData) {
        clubData.isActive = true;
        clubData.intro = "I love skincare and living healthy";
        incrementPayload = { "overview.user.club.rejoined": 1 };
      } else {
        clubData = {
          isActive: true,
          intro: "I love skincare and living healthy.",
          socials: [],
          payouts: defaultClubPayoutData,
        };

        incrementPayload = { "overview.user.club.joined": 1 };
      }

      await doWithRetries(() =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $set: { club: clubData, name, avatar } }
        )
      );

      updateContent({
        filter: { userId: new ObjectId(req.userId) },
        collections: [
          "BeforeAfter",
          "Progress",
          "Proof",
          "Diary",
          "Routine",
          "Task",
        ],
        updatePayload: { userName: name, avatar },
      });

      updateAnalytics({
        userId: req.userId,
        incrementPayload,
      });

      res.status(200).json({ message: { club: clubData, name, avatar } });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
