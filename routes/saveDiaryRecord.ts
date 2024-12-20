import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import { daysFrom } from "@/helpers/utils.js";

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
          body: JSON.stringify({ audioFile: audio }),
        })
      );

      const body = await response.json();

      if (!response.ok) {
        throw httpError(body.message);
      }

      const midnight = setUtcMidnight({ date: new Date(), timeZone });

      const newDiaryRecord = {
        _id: new ObjectId(),
        type,
        audio,
        activity,
        userId: new ObjectId(req.userId),
        transcription: body.message,
        createdAt: midnight,
        isBlocked: false,
      };

      await doWithRetries(async () =>
        db.collection("Diary").insertOne(newDiaryRecord)
      );

      const nextDiaryRecordAfter = setUtcMidnight({
        date: daysFrom({ days: 1 }),
      });

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(req.userId) },
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
    } catch (err) {
      next(err);
    }
  }
);

export default route;
