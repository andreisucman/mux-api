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
import { db } from "init.js";
import saveModerationResult from "@/functions/saveModerationResult.js";
import { PrivacyType } from "types.js";
import { DiaryRecordType } from "@/types/saveDiaryRecordTypes.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { audio, type, activity, timeZone } = req.body;

    if (!type || !audio || !activity || !timeZone) {
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
        res.status(200).json({
          error: `This record contains inappropriate language. Please try again.`,
        });
        return;
      }

      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { name: 1, avatar: 1, "club.privacy": 1 },
      });

      const midnight = setUtcMidnight({ date: new Date(), timeZone });

      const newDiaryRecord: DiaryRecordType = {
        _id: new ObjectId(),
        type,
        userName: null,
        avatar: null,
        isPublic: false,
        audio,
        activity,
        userId: new ObjectId(req.userId),
        transcription: body.message,
        createdAt: midnight,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      const { name, avatar, club } = userInfo;
      if (name) newDiaryRecord.userName = name;
      if (avatar) newDiaryRecord.avatar = avatar;

      const { privacy } = club || {};
      const relevantTypePrivacy = privacy?.find(
        (typePrivacyObj: PrivacyType) => typePrivacyObj.name === type
      );

      if (relevantTypePrivacy) {
        newDiaryRecord.isPublic = relevantTypePrivacy.value;
      }

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
        saveModerationResult({
          userId: req.userId,
          categoryName: CategoryNameEnum.DIARY,
          isSafe,
          moderationResults,
          isSuspicious,
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
