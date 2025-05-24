import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CategoryNameEnum,
  CustomRequest,
  ModerationStatusEnum,
  UserConcernType,
} from "types.js";
import { UploadProgressUserInfo } from "types/uploadProgressTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import analyzeAppearance from "functions/analyzeAppearance.js";
import httpError from "@/helpers/httpError.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { db } from "init.js";

const route = Router();

type Props = {
  userId: string;
  part: string;
  userUploadedConcerns: UserConcernType[];
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userId, part, userUploadedConcerns = [] }: Props = req.body;

    const finalUserId = req.userId || userId;

    if (!ObjectId.isValid(finalUserId) || !part) {
      res.status(400).json({
        message: `userId: ${finalUserId} is missing.`,
      });
      return;
    }

    try {
      let sanitatedConcerns = userUploadedConcerns;

      const analysisAlreadyStarted = await doWithRetries(async () =>
        db.collection("AnalysisStatus").countDocuments({
          userId: new ObjectId(req.userId),
          operationKey: "progress",
          isRunning: true,
        })
      );

      if (analysisAlreadyStarted) {
        res.status(400).json({
          error: "Bad request",
        });
        return;
      }

      if (userUploadedConcerns.length > 0) {
        const sanitatedUserUploadedConcerns = await doWithRetries(() =>
          db
            .collection("Concern")
            .find(
              { name: { $in: userUploadedConcerns.map((c) => c.name) } },
              { projection: { name: 1 } }
            )
            .toArray()
        );

        const arrayOfExistingConcerns = sanitatedUserUploadedConcerns.map(
          (co) => co.name
        );

        sanitatedConcerns = userUploadedConcerns.filter((co) =>
          arrayOfExistingConcerns.includes(co.name)
        );
      }

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(finalUserId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              nextScan: 1,
              name: 1,
              avatar: 1,
              toAnalyze: 1,
              demographics: 1,
              concerns: 1,
              nutrition: 1,
              country: 1,
              timeZone: 1,
              initialProgressImages: 1,
              specialConsiderations: 1,
              latestConcernScores: 1,
              latestConcernScoresDifference: 1,
              club: 1,
            },
          }
        )
      )) as unknown as UploadProgressUserInfo;

      if (!userInfo) throw httpError(`No userInfo for ${finalUserId}`);

      let {
        name,
        toAnalyze,
        nextScan,
        club,
        concerns,
        demographics,
        initialProgressImages,
        latestConcernScores,
        latestConcernScoresDifference,
        specialConsiderations,
      } = userInfo;

      const initialPartProgressImages = initialProgressImages[part];
      const differenceInImages =
        toAnalyze.length - initialPartProgressImages.length;

      if (Math.abs(differenceInImages) > 0) {
        res.status(400).json({ error: "Bad request" });
        console.error(
          `The image count doesn't match the previous record for ${req.userId}.`
        );
        return;
      }

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(finalUserId), operationKey: "progress" },
          {
            $set: {
              isRunning: true,
              progress: 1,
              isError: null,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        )
      );

      res.status(200).json({
        toAnalyze,
      });

      global.startInterval(
        () =>
          incrementProgress({
            operationKey: "progress",
            userId: req.userId,
            value: Math.min(Math.round(Math.random() * 5), 1),
          }),
        1000
      );

      await analyzeAppearance({
        club,
        userId,
        name,
        nextScan,
        allConcerns: concerns || [],
        userUploadedConcerns: sanitatedConcerns,
        categoryName: CategoryNameEnum.SCAN,
        demographics,
        toAnalyze,
        latestConcernScores,
        latestConcernScoresDifference,
        initialProgressImages,
        newSpecialConsiderations: specialConsiderations,
      });

      global.stopInterval();
    } catch (err) {
      await addAnalysisStatusError({
        operationKey: "progress",
        userId: String(finalUserId),
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
