import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CategoryNameEnum, CustomRequest, ModerationStatusEnum, UserConcernType } from "types.js";
import { UploadProgressUserInfo } from "types/uploadProgressTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import analyzeAppearance from "functions/analyzeAppearance.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";
import incrementProgress from "@/helpers/incrementProgress.js";

const route = Router();

type Props = {
  userId: string;
  userUploadedConcerns: UserConcernType[];
};

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { userId, userUploadedConcerns = [] }: Props = req.body;

  const finalUserId = req.userId || userId;

  if (!ObjectId.isValid(finalUserId)) {
    res.status(400).json({
      message: `userId: ${finalUserId} is missing.`,
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
            nextScan: 1,
            name: 1,
            avatar: 1,
            toAnalyze: 1,
            demographics: 1,
            concerns: 1,
            nutrition: 1,
            country: 1,
            timeZone: 1,
            latestProgressImages: 1,
            specialConsiderations: 1,
            latestConcernScores: 1,
            latestConcernScoresDifference: 1,
            latestFeatureScores: 1,
            latestFeatureScoresDifference: 1,
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
      nextScan,
      club,
      concerns,
      demographics,
      latestProgressImages,
      latestConcernScores,
      latestConcernScoresDifference,
      latestFeatureScores,
      latestFeatureScoresDifference,
      specialConsiderations,
    } = userInfo;

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(finalUserId), operationKey: "progress" },
          { $set: { isRunning: true, progress: 1, isError: null } },
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
      2000
    );

    await analyzeAppearance({
      club,
      userId,
      name,
      avatar,
      nextScan,
      allConcerns: concerns || [],
      userUploadedConcerns,
      categoryName: CategoryNameEnum.SCAN,
      demographics,
      toAnalyze,
      latestConcernScores,
      latestConcernScoresDifference,
      latestFeatureScores,
      latestFeatureScoresDifference,
      latestProgressImages,
      newSpecialConsiderations: specialConsiderations,
    });

    global.stopInterval();
  } catch (err) {
    await addAnalysisStatusError({
      operationKey: "progress",
      userId: String(finalUserId),
      message: "An unexpected error occured. Please try again and inform us if the error persists.",
      originalMessage: err.message,
    });
    global.stopInterval();
    next(err);
  }
});

export default route;
