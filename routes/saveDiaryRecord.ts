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
import createTextEmbedding from "@/functions/createTextEmbedding.js";
import { checkIfPublic } from "./checkIfPublic.js";
import { db } from "init.js";
import { normalizeString } from "@/helpers/utils.js";

const route = Router();

const validParts = [PartEnum.FACE, PartEnum.HAIR];

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { audio, activity, part, concern, routineId } = req.body;

  if (!audio || !activity || !validParts.includes(part) || !routineId || !concern) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const usersTodayMidnight = setToMidnight({ date: new Date(), timeZone: req.timeZone });

    const todaysDiaryRecords = await doWithRetries(async () =>
      db.collection("Diary").findOne({ createdAt: { $gt: usersTodayMidnight }, concern })
    );

    if (todaysDiaryRecords) {
      res.status(200).json({
        error: `You've already added a diary note for ${normalizeString(concern)} today. Come back tomorrow.`,
      });
      return;
    }

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

    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { name: 1, avatar: 1 },
    });

    const embedding = await createTextEmbedding({
      categoryName: CategoryNameEnum.DIARY,
      text: body.message,
      userId: req.userId,
      dimensions: 1536,
    });

    const newDiaryRecord: DiaryType = {
      _id: new ObjectId(),
      part,
      audio,
      activity,
      embedding,
      isPublic: false,
      userName: null,
      userId: new ObjectId(req.userId),
      transcription: body.message,
      createdAt: new Date(),
      moderationStatus: ModerationStatusEnum.ACTIVE,
      concerns: activity.map((a) => a.concern),
    };

    const isPublicResponse = await checkIfPublic({
      userId: req.userId,
      concern,
    });

    newDiaryRecord.isPublic = isPublicResponse.isPublic;

    const { name } = userInfo;
    if (name) newDiaryRecord.userName = name;

    const routine = await doWithRetries(async () =>
      db.collection("Routine").findOne(
        {
          _id: new ObjectId(routineId),
          userId: new ObjectId(req.userId),
        },
        { projection: { concerns: 1 } }
      )
    );

    newDiaryRecord.concerns = routine.concerns;

    await doWithRetries(async () => db.collection("Diary").insertOne(newDiaryRecord));

    res.status(200).json({
      message: {
        _id: newDiaryRecord._id,
        part: newDiaryRecord.part,
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
          collection: SuspiciousRecordCollectionEnum.DIARY,
          moderationResults,
          contentId: String(newDiaryRecord._id),
          userId: req.userId,
        });
      }
    }
  } catch (err) {
    next(err);
  }
});

export default route;
