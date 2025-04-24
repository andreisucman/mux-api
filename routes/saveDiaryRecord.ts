import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import moderateContent from "@/functions/moderateContent.js";
import { ModerationStatusEnum, CustomRequest, CategoryNameEnum, PartEnum } from "types.js";
import addSuspiciousRecord, { SuspiciousRecordCollectionEnum } from "@/functions/addSuspiciousRecord.js";
import addModerationAnalyticsData from "@/functions/addModerationAnalyticsData.js";
import { DiaryType } from "@/types/saveDiaryRecordTypes.js";
import getUserInfo from "@/functions/getUserInfo.js";
import { checkIfPublic } from "./checkIfPublic.js";
import { db } from "init.js";
import updateRoutineDataStats from "@/functions/updateRoutineDataStats.js";

const route = Router();

const validParts = [PartEnum.FACE, PartEnum.HAIR];

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { audio, part, concern, activity } = req.body;

  if (!audio || !activity || !validParts.includes(part) || !concern) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const cookieString = Object.entries(req.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");

    const response = await doWithRetries(async () =>
      fetch(`${process.env.PROCESSING_SERVER_URL}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
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

    const { isSafe, isSuspicious, moderationResults } = await moderateContent({
      content: [{ type: "text", text: body.message }],
    });

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

    const usersTodayMidnight = setToMidnight({ date: new Date(), timeZone: req.timeZone });

    const todayAdded = await doWithRetries(async () =>
      db
        .collection("Diary")
        .find({ userId: new ObjectId(req.userId), createdAt: { $gte: usersTodayMidnight }, part, concern })
        .toArray()
    );

    if (todayAdded) {
      const addedCount = todayAdded.flatMap((rec) => rec.audio).length;
      if (addedCount > 9) {
        res.status(200).json({ error: "No more than 10 records per day." });
        return;
      }
    }

    const todaysDiaryRecord = await doWithRetries(async () =>
      db.collection("Diary").findOne({
        userId: new ObjectId(req.userId),
        createdAt: { $gte: usersTodayMidnight },
        part,
        concern,
        deletedOn: { $exists: false },
      })
    );

    let updatedId;

    if (todaysDiaryRecord) {
      const updateOp: any = {
        $push: {
          transcriptions: { createdAt: new Date(), text: body.message },
          audio: { createdAt: new Date(), url: audio },
        },
      };

      await doWithRetries(async () => db.collection("Diary").updateOne({ _id: todaysDiaryRecord._id }, updateOp));
      updatedId = todaysDiaryRecord._id;
    } else {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { name: 1 },
      });

      const newDiaryRecord: DiaryType = {
        _id: new ObjectId(),
        part,
        audio: [{ createdAt: new Date(), url: audio }],
        activity,
        concern,
        isPublic: false,
        userName: null,
        userId: new ObjectId(req.userId),
        transcriptions: [{ createdAt: new Date(), text: body.message }],
        createdAt: new Date(),
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      const isPublicResponse = await checkIfPublic({
        userId: req.userId,
        concern,
      });

      newDiaryRecord.isPublic = isPublicResponse.isPublic;

      const { name } = userInfo;
      if (name) newDiaryRecord.userName = name;

      const response = await doWithRetries(async () => db.collection("Diary").insertOne(newDiaryRecord));
      updatedId = response.insertedId;
    }

    const updatedRecord = await doWithRetries(async () => db.collection("Diary").findOne({ _id: updatedId }));

    updateRoutineDataStats({ userId: req.userId, part, concerns: [concern] });

    res.status(200).json({
      message: updatedRecord,
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
          collection: SuspiciousRecordCollectionEnum.DIARY,
          moderationResults,
          contentId: String(updatedRecord._id),
          userId: req.userId,
        });
      }
    }
  } catch (err) {
    next(err);
  }
});

export default route;
