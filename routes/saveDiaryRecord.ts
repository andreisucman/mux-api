import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { audio, type, activity } = req.body;

    if (!type || !audio) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const response = await doWithRetries(async () =>
        fetch(`${process.env.PROCESSING_SERVER_URL}/transcribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: process.env.PROCESSING_SECRET,
          },
          body: JSON.stringify({ audioFile: audio }),
        })
      );

      const body = await response.json();

      if (!response.ok) {
        throw httpError(body.message);
      }

      const utcDate = setUtcMidnight({ date: new Date() });

      const newDiaryRecord = {
        _id: new ObjectId(),
        type,
        activity,
        userId: new ObjectId(req.userId),
        transcription: body.message,
        audio,
        createdAt: utcDate,
      };

      await doWithRetries(async () =>
        db.collection("Diary").insertOne(newDiaryRecord)
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
