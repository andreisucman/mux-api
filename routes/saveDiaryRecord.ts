import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import moderateContent from "@/functions/moderateContent.js";
import {
  ModerationStatusEnum,
  CustomRequest,
  CategoryNameEnum,
} from "types.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";
import { daysFrom } from "@/helpers/utils.js";
import addModerationAnalyticsData from "@/functions/addModerationAnalyticsData.js";
import {
  DiaryActivityType,
  DiaryRecordType,
} from "@/types/saveDiaryRecordTypes.js";
import getUserInfo from "@/functions/getUserInfo.js";
import createMultimodalEmbedding from "@/functions/createMultiModalEmbedding.js";
import createImageCollage from "@/functions/createImageCollage.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { audio, activity, timeZone } = req.body;

    if (!audio || !activity || !timeZone) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const usersTodayMidnight = setUtcMidnight({ date: new Date(), timeZone });

      const todaysDiaryRecords = await doWithRetries(async () =>
        db
          .collection("Diary")
          .findOne({ createdAt: { $gt: usersTodayMidnight } })
      );

      if (todaysDiaryRecords) {
        res.status(200).json({
          error:
            "You've already added a diary note for today. Come back tomorrow.",
        });
        return;
      }

      const response = await doWithRetries(async () =>
        fetch(`${process.env.PROCESSING_SERVER_URL}/transcribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: process.env.PROCESSING_SECRET,
            UserId: req.userId,
          },
          body: JSON.stringify({
            audioFile: audio,
            categoryName: CategoryNameEnum.DIARY,
          }),
        })
      );

      const body = await response.json();

      if (!response.ok) {
        throw httpError(body.message);
      }

      const { isSafe, isSuspicious, moderationResults } = await moderateContent(
        {
          content: [{ type: "text", text: body.message }],
        }
      );

      if (!isSafe) {
        addModerationAnalyticsData({
          categoryName: CategoryNameEnum.DIARY,
          isSafe,
          moderationResults,
          isSuspicious,
          userId: req.userId,
        });

        res.status(200).json({
          error: `It appears that this record contains inappropriate language. Please try again.`,
        });
        return;
      }

      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { name: 1, avatar: 1, "club.privacy": 1 },
      });

      const imagesOfActivities = activity.map((a: DiaryActivityType) =>
        a.contentType === "image" ? a.url : a.thumbnail
      );

      const imagesForCollage = imagesOfActivities.slice(0, 25);

      const collageSize = Math.round(
        Math.max(
          Math.min(Math.sqrt(imagesForCollage.length * 256 * 250), 2048),
          768
        )
      );
      const collageImage = await createImageCollage({
        images: imagesForCollage,
        collageSize,
        isGrid: true,
      });

      const embedding = await createMultimodalEmbedding({
        categoryName: CategoryNameEnum.DIARY,
        text: body.message,
        userId: req.userId,
        imageUrl: collageImage,
      });

      const newDiaryRecord: DiaryRecordType = {
        _id: new ObjectId(),
        audio,
        activity,
        embedding,
        userName: null,
        avatar: null,
        collageImage,
        userId: new ObjectId(req.userId),
        transcription: body.message,
        createdAt: new Date(),
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      const { name, avatar } = userInfo;
      if (name) newDiaryRecord.userName = name;
      if (avatar) newDiaryRecord.avatar = avatar;

      await doWithRetries(async () =>
        db.collection("Diary").insertOne(newDiaryRecord)
      );

      const nextDiaryRecordAfter = setUtcMidnight({
        date: daysFrom({ days: 1 }),
      });

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $set: { nextDiaryRecordAfter } }
        )
      );

      res.status(200).json({
        message: {
          _id: newDiaryRecord._id,
          audio: newDiaryRecord.audio,
          createdAt: newDiaryRecord.createdAt,
          transcription: newDiaryRecord.transcription,
        },
      });

      if (moderationResults.length > 0) {
        addModerationAnalyticsData({
          categoryName: CategoryNameEnum.DIARY,
          isSafe,
          moderationResults,
          isSuspicious,
          userId: req.userId,
        });

        if (isSuspicious) {
          addSuspiciousRecord({
            collection: "Diary",
            moderationResults,
            contentId: String(newDiaryRecord._id),
            userId: req.userId,
          });
        }
      }
    } catch (err) {
      next(err);
    }
  }
);

export default route;
