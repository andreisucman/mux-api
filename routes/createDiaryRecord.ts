import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import { DiaryActivityType } from "@/types/createDiaryRecordTypes.js";
import { db } from "init.js";
import { ContentModerationStatusEnum } from "types.js";
import { daysFrom } from "@/helpers/utils.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { type, timeZone } = req.body;

    if (!timeZone || !type || !["head", "body", "health"].includes(type)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const usersTodayMidnight = setUtcMidnight({ date: new Date(), timeZone });

      const todaysDiaryRecords = await doWithRetries(async () =>
        db
          .collection("Diary")
          .findOne({
            createdAt: { $gt: usersTodayMidnight },
            moderationStatus: ContentModerationStatusEnum.ACTIVE,
          })
      );

      if (todaysDiaryRecords) {
        res.status(200).json({
          error:
            "You've already added a diary note for today. Come back tomorrow.",
        });
        return;
      }

      const usersTomorrowMidnight = setUtcMidnight({
        date: daysFrom({ days: 1 }),
        timeZone,
      });

      const results: DiaryActivityType[] = [];

      const proofFilters: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        createdAt: { $gte: usersTodayMidnight, $lt: usersTomorrowMidnight },
        moderationStatus: ContentModerationStatusEnum.ACTIVE,
        type,
      };

      const todaysProof = await doWithRetries(async () =>
        db
          .collection("Proof")
          .find(proofFilters, {
            projection: {
              contentType: 1,
              taskName: 1,
              mainUrl: 1,
              mainThumbnail: 1,
              icon: 1,
            },
          })
          .toArray()
      );

      for (const proof of todaysProof) {
        results.push({
          name: proof.taskName,
          url: proof.mainUrl.url,
          thumbnail: proof.mainThumbnail.url,
          icon: proof.icon,
          type: proof.contentType,
        });
      }

      const styleFilters: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        createdAt: { $gte: usersTodayMidnight, $lt: usersTomorrowMidnight },
        moderationStatus: ContentModerationStatusEnum.ACTIVE,
        type,
      };

      const todaysStyles = await doWithRetries(async () =>
        db
          .collection("StyleAnalysis")
          .find(styleFilters, {
            projection: { styleName: 1, mainUrl: 1, styleIcon: 1 },
          })
          .toArray()
      );

      for (const style of todaysStyles) {
        results.push({
          name: style.styleName,
          url: style.mainUrl.url,
          icon: style.styleIcon,
          type: "image",
        });
      }

      const foodFilters: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        createdAt: { $gte: usersTodayMidnight, $lt: usersTomorrowMidnight },
        type,
      };

      const todaysFood = await doWithRetries(async () =>
        db
          .collection("FoodAnalysis")
          .find(foodFilters, {
            projection: { url: 1 },
          })
          .toArray()
      );

      for (const food of todaysFood) {
        results.push({
          url: food.url,
          type: "image",
        });
      }

      if (results.length === 0) {
        res.status(200).json({
          error: `You don't have any activity today. Try again after you have done something .`,
        });
        return;
      }

      res.status(200).json({ message: results });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
