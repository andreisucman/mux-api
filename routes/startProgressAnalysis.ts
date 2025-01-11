import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import {
  BlurTypeEnum,
  CategoryNameEnum,
  CustomRequest,
  ModerationStatusEnum,
  TypeEnum,
} from "types.js";
import { UploadProgressUserInfo } from "types/uploadProgressTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import analyzeAppearance from "functions/analyzeAppearance.js";
import formatDate from "@/helpers/formatDate.js";
import checkCanScan from "@/helpers/checkCanScan.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

const route = Router();

type Props = {
  type: TypeEnum;
  userId: string;
  blurType: BlurTypeEnum;
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userId, type, blurType }: Props = req.body;

    const finalUserId = req.userId || userId;

    if (!finalUserId || !type || !["head", "body"].includes(type)) {
      res.status(400).json({
        message: `userId: ${finalUserId}, type: ${type} is missing`,
      });
      return;
    }

    try {
      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(finalUserId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              name: 1,
              avatar: 1,
              toAnalyze: 1,
              demographics: 1,
              concerns: 1,
              potential: 1,
              city: 1,
              nutrition: 1,
              country: 1,
              timeZone: 1,
              nextScan: 1,
              latestProgress: 1,
              specialConsiderations: 1,
              latestScoresDifference: 1,
              currentlyHigherThan: 1,
              potentiallyHigherThan: 1,
              latestScores: 1,
              club: 1,
            },
          }
        )
      )) as unknown as UploadProgressUserInfo;

      if (!userInfo) throw httpError(`No userInfo for ${finalUserId}`);

      let {
        name,
        avatar,
        toAnalyze,
        club,
        nutrition,
        nextScan,
        concerns,
        demographics,
        potential,
        latestProgress,
        latestScores,
        currentlyHigherThan,
        potentiallyHigherThan,
        latestScoresDifference,
        specialConsiderations,
      } = userInfo;

      const { canScan, canScanDate } =
        checkCanScan({ nextScan, toAnalyze, type }) || {};

      if (!canScan) {
        const date = formatDate({ date: canScanDate });
        res.status(200).json({
          error: `You have already analyzed yourself. Try again after ${date}.`,
        });
        return;
      }

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(finalUserId), operationKey: type },
            { $set: { isRunning: true, progress: 1, isError: null } },
            { upsert: true }
          )
      );

      res.status(200).end();

      await analyzeAppearance({
        type,
        club,
        userId,
        name,
        avatar,
        concerns: concerns || [],
        nextScan,
        potential,
        blurType,
        categoryName: CategoryNameEnum.PROGRESSSCAN,
        demographics,
        toAnalyze,
        latestScores,
        latestProgress,
        currentlyHigherThan,
        potentiallyHigherThan,
        latestScoresDifference,
        newSpecialConsiderations: specialConsiderations,
        nutrition,
      });
    } catch (err) {
      await addAnalysisStatusError({
        operationKey: type,
        userId: String(finalUserId),
        message:
          "An unexpected error occured. Please try again and inform us if the error persists.",
        originalMessage: err.message,
      });
      next(err);
    }
  }
);

export default route;
