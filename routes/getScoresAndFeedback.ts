import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CategoryNameEnum,
  CustomRequest,
  FormattedRatingType,
  ModerationStatusEnum,
  ProgressType,
} from "types.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import getScoresAndFeedbackOfAPart from "@/functions/getScoresAndFeedbackOfAPart.js";
import { GetScoresAndFeedbackUserType } from "@/types/getScoresAndFeedbackTypes.js";
import { db } from "init.js";
import incrementProgress from "@/helpers/incrementProgress.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const progressRecords = (await doWithRetries(async () =>
        db
          .collection("Progress")
          .aggregate([
            {
              $match: {
                userId: new ObjectId(req.userId),
                "scores.explanations": { $exists: false },
                moderationStatus: ModerationStatusEnum.ACTIVE,
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: "$part",
                doc: { $first: "$$ROOT" },
              },
            },
            { $replaceRoot: { newRoot: "$doc" } },
          ])
          .toArray()
      )) as unknown as ProgressType[];

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              scanAnalysisQuota: 1,
              "demographics.sex": 1,
              concerns: 1,
              latestScores: 1,
              latestProgress: 1,
              latestScoresDifference: 1,
            },
          }
        )
      )) as unknown as GetScoresAndFeedbackUserType;

      let {
        scanAnalysisQuota,
        demographics,
        concerns,
        latestScores,
        latestScoresDifference,
        latestProgress,
      } = userInfo;

      const { sex } = demographics;

      if (scanAnalysisQuota < 1) {
        res.status(200).json({
          error: "buy scan analysis",
        });
        return;
      }

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(req.userId), operationKey: "progress" },
            { $set: { isRunning: true, progress: 1, isError: null } },
            { upsert: true }
          )
      );

      global.startInterval(() =>
        incrementProgress({
          operationKey: "progress",
          userId: req.userId,
          value: 1,
        })
      );

      res.status(200).end();

      const promises = progressRecords.map((record) => {
        const partConcerns = concerns.filter((c) => c.part === record.part);
        const imageObjects = record.images.map(({ position, mainUrl }) => ({
          part: record.part,
          position,
          url: mainUrl.url,
        }));
        return doWithRetries(() =>
          getScoresAndFeedbackOfAPart({
            categoryName: CategoryNameEnum.PROGRESSSCAN,
            part: record.part,
            sex,
            userId: req.userId,
            progressId: record._id,
            partConcerns,
            imageObjects,
          })
        );
      });

      const results = await Promise.all(promises);

      const toUpdateProgressOps = progressRecords.map((record, index) => ({
        updateOne: {
          filter: { _id: new ObjectId(record._id) },
          update: { $set: results[index] },
        },
      }));

      if (toUpdateProgressOps.length) {
        await doWithRetries(() =>
          db.collection("Progress").bulkWrite(toUpdateProgressOps)
        );
      }

      /* update in user record */
      const allConcerns = [];

      for (let i = 0; i < results.length; i++) {
        const resultsRecord = results[i];
        const oldProgressRecord = progressRecords[i];
        const updatedProgressRecord = {
          ...oldProgressRecord,
          ...resultsRecord,
        };
        allConcerns.push(...resultsRecord.concerns);

        latestScores[resultsRecord.part] = resultsRecord.scores;
        latestScoresDifference[resultsRecord.part] =
          resultsRecord.scoresDifference;
        latestProgress[resultsRecord.part] = updatedProgressRecord;
      }

      const latestScoresValues = Object.values(latestScores)
        .filter((v) => typeof v !== "number" && v !== null)
        .map((object: FormattedRatingType) => object.overall);

      latestScores.overall = Math.round(
        latestScoresValues.reduce((a, c) => a + c, 0) /
          latestScoresValues.length
      );

      const latestScoresDifferenceValues = Object.values(latestScoresDifference)
        .filter((v) => typeof v !== "number" && v !== null)
        .map((object: FormattedRatingType) => object.overall);

      latestScoresDifference.overall = Math.round(
        latestScoresDifferenceValues.reduce((a, c) => a + c, 0) /
          latestScoresDifferenceValues.length
      );

      latestProgress.overall = latestScores.overall;

      concerns = allConcerns.filter(
        (obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i
      );

      await doWithRetries(() =>
        db.collection("User").updateOne(
          { _id: new ObjectId(req.userId) },
          {
            $set: {
              concerns,
              latestScores,
              latestScoresDifference,
              latestProgress,
            },
          }
        )
      );

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(req.userId), operationKey: "progress" },
            { $set: { isRunning: false, progress: 0, isError: null } },
            { upsert: true }
          )
      );
      global.stopInterval();
    } catch (err) {
      await addAnalysisStatusError({
        operationKey: "progress",
        userId: String(req.userId),
        message:
          "An unexpected error occured. Please try again and inform us if the error persists.",
        originalMessage: err.message,
      });
      global.stopInterval();
      next(err);
    }
  }
);

export default route;
