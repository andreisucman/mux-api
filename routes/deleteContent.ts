import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import recalculateLatestProgress from "@/functions/recalculateLatestProgress.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import getUserInfo from "@/functions/getUserInfo.js";
import { defaultUser } from "@/data/defaultUser.js";
import { CustomRequest, ProgressType } from "types.js";
import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

const collectionMap: { [key: string]: string } = {
  progress: "Progress",
  style: "StyleAnalysis",
  proof: "Proof",
  diary: "Diary",
  about: "FaqAnswer",
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { contentId, collectionKey } = req.body;

    const allowedKeys = Object.keys(collectionMap);

    if (!allowedKeys.includes(collectionKey)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    if (!ObjectId.isValid(contentId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({ userId: req.userId });

      const recordToDelete = await doWithRetries(async () =>
        db
          .collection(collectionMap[collectionKey])
          .findOne({ _id: new ObjectId(contentId) })
      );

      await doWithRetries(async () =>
        db
          .collection(collectionMap[collectionKey])
          .deleteOne({ _id: new ObjectId(contentId) })
      );

      switch (collectionKey) {
        case "progress":
          const {
            _id: userId,
            potential,
            latestScores,
            nextScan,
            latestScoresDifference,
          } = userInfo;

          const substituteProgressRecord = (await doWithRetries(async () =>
            db
              .collection("Progress")
              .find({
                userId: new ObjectId(req.userId),
                part: recordToDelete.part,
              })
              .sort({ _id: -1 })
              .next()
          )) as unknown as ProgressType;

          let recalculatedData;

          if (substituteProgressRecord) {
            recalculatedData = await recalculateLatestProgress({
              potential,
              latestScores,
              latestScoresDifference,
              substituteProgressRecord,
            });

            const { images, concerns, createdAt, scores, scoresDifference } =
              substituteProgressRecord;

            const toUpdatePayload = {
              scores,
              images,
              concerns,
              updatedAt: createdAt,
              scoresDifference,
            };

            await doWithRetries(() =>
              db.collection("BeforeAfter").updateOne(
                {
                  userId: new ObjectId(userId),
                  part: recordToDelete.part,
                },
                { $set: toUpdatePayload }
              )
            );
          } else {
            recalculatedData = {
              latestProgress: defaultUser.latestProgress,
              latestScores: defaultUser.latestScores,
              potential: defaultUser.potential,
              latestScoresDifference: defaultUser.latestScoresDifference,
            };

            await doWithRetries(() =>
              db.collection("BeforeAfter").deleteOne({
                userId: new ObjectId(userId),
                part: recordToDelete.part,
              })
            );
          }

          if (substituteProgressRecord) {
            const relevantScan = nextScan.find(
              (rec) => rec.part === substituteProgressRecord.part
            );

            if (!relevantScan) throw httpError("Type scan not found");

            const newPartScans = nextScan.map((rec) =>
              rec.part === relevantScan.part
                ? { ...relevantScan, date: new Date() }
                : rec
            );

            await doWithRetries(async () =>
              db.collection("User").updateOne(
                { _id: new ObjectId(req.userId) },
                {
                  $set: recalculatedData,
                  nextScan: newPartScans,
                }
              )
            );
          }
          break;
        case "style":
          const substituteStyleRecord = await doWithRetries(async () =>
            db
              .collection("StyleAnalysis")
              .find({
                userId: new ObjectId(req.userId),
              })
              .sort({ _id: -1 })
              .next()
          );

          let newLatestStyleAnalysis = null;

          if (substituteStyleRecord) {
            newLatestStyleAnalysis = substituteStyleRecord;
          }

          await doWithRetries(async () =>
            db
              .collection("User")
              .updateOne(
                { _id: new ObjectId(req.userId) },
                { $set: { latestStyleAnalysis: newLatestStyleAnalysis } }
              )
          );
          break;
      }

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
