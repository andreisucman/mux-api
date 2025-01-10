import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import recalculateLatestProgress from "@/functions/recalculateLatestProgress.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import getUserInfo from "@/functions/getUserInfo.js";
import { defaultUser } from "@/data/defaultUser.js";
import { CustomRequest, NextActionType, ProgressType } from "types.js";
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
            demographics,
            _id: userId,
            currentlyHigherThan,
            potentiallyHigherThan,
            potential,
            latestScores,
            nextScan,
            latestScoresDifference,
          } = userInfo;
          const { ageInterval, sex } = demographics;

          const substituteProgressRecord = (await doWithRetries(async () =>
            db
              .collection(collectionMap[collectionKey])
              .find({
                userId: new ObjectId(req.userId),
                type: recordToDelete.type,
                part: recordToDelete.part,
              })
              .sort({ _id: -1 })
              .next()
          )) as unknown as ProgressType;

          let recalculatedData;

          if (substituteProgressRecord) {
            recalculatedData = await recalculateLatestProgress({
              sex,
              ageInterval,
              potential,
              latestScores,
              userId: String(userId),
              currentlyHigherThan,
              potentiallyHigherThan,
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
                  type: recordToDelete.type,
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
              currentlyHigherThan: defaultUser.currentlyHigherThan,
              potentiallyHigherThan: defaultUser.potentiallyHigherThan,
            };

            await doWithRetries(() =>
              db.collection("BeforeAfter").deleteOne({
                userId: new ObjectId(userId),
                type: recordToDelete.type,
                part: recordToDelete.part,
              })
            );
          }

          if (substituteProgressRecord) {
            const relevantTypeScan = (nextScan as NextActionType).find(
              (rec) => rec.type === substituteProgressRecord.type
            );

            if (!relevantTypeScan) throw httpError("Type scan not found");

            const relevantPartScan = relevantTypeScan.parts.find(
              (rec) => rec.part === substituteProgressRecord.part
            );

            if (!relevantPartScan) throw httpError("Part scan not found");

            const newPartScans = relevantTypeScan.parts.map((rec) =>
              rec.part === relevantPartScan.part
                ? { ...relevantPartScan, date: new Date() }
                : rec
            );

            const newTypeScans = (nextScan as NextActionType).map((rec) =>
              rec.type === relevantTypeScan.type
                ? { ...relevantTypeScan, parts: newPartScans, date: new Date() }
                : rec
            );

            await doWithRetries(async () =>
              db.collection("User").updateOne(
                { _id: new ObjectId(req.userId) },
                {
                  $set: recalculatedData,
                  nextScan: {
                    ...nextScan,
                    [substituteProgressRecord.type]: newTypeScans,
                  },
                }
              )
            );
          }
          break;
        case "style":
          const { latestStyleAnalysis } = userInfo;

          const substituteStyleRecord = await doWithRetries(async () =>
            db
              .collection(collectionMap[collectionKey])
              .find({
                userId: new ObjectId(req.userId),
                type: recordToDelete.type,
              })
              .sort({ _id: -1 })
              .next()
          );

          let newLatestStyleAnalysis;

          if (substituteStyleRecord) {
            newLatestStyleAnalysis = {
              ...latestStyleAnalysis,
              [recordToDelete.type]: substituteStyleRecord,
            };
          } else {
            newLatestStyleAnalysis = defaultUser.latestStyleAnalysis;
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
      next(httpError(err.message, err.status));
    }
  }
);

export default route;
