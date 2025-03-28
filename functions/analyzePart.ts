import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  DemographicsType,
  ToAnalyzeType,
  UserConcernType,
  ProgressType,
  ClubDataType,
  PartEnum,
  BlurTypeEnum,
  ProgressImageType,
  BeforeAfterType,
  CategoryNameEnum,
  FormattedRatingType,
} from "types.js";
import addModerationAnalyticsData from "./addModerationAnalyticsData.js";
import addSuspiciousRecord, {
  SuspiciousRecordCollectionEnum,
} from "./addSuspiciousRecord.js";
import { ModerationStatusEnum } from "types.js";
import moderateContent, { ModerationResultType } from "./moderateContent.js";
import updateProgressImages from "functions/updateProgressImages.js";
import { PartResultType } from "@/types/analyzePartTypes.js";
import { db } from "init.js";
import checkIfSelf from "./checkIfSelf.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import { CookieOptions } from "express";
import incrementProgress from "@/helpers/incrementProgress.js";
import getScoresAndFeedback from "./getScoresAndFeedback.js";
import { checkIfPublic } from "@/routes/checkIfPublic.js";

type Props = {
  userId: string;
  name: string;
  cookies: CookieOptions;
  avatar: { [key: string]: any } | null;
  blurType: BlurTypeEnum;
  part: PartEnum;
  enableScanAnalysis: boolean;
  club: ClubDataType;
  specialConsiderations: string;
  concerns: UserConcernType[] | null;
  demographics: DemographicsType;
  toAnalyze: ToAnalyzeType[];
  categoryName: CategoryNameEnum;
};

type LocalProgressType = {
  _id: ObjectId;
  scores: FormattedRatingType;
  images: ProgressImageType[];
  createdAt: Date;
};

export default async function analyzePart({
  userId,
  name,
  avatar,
  part,
  cookies,
  blurType,
  concerns = [],
  categoryName,
  demographics,
  enableScanAnalysis,
  specialConsiderations,
  toAnalyze,
}: Props): Promise<PartResultType> {
  try {
    const partConcerns = concerns.filter((obj) => obj.part === part);
    const partToAnalyze = toAnalyze.filter((obj) => obj.part === part);

    let isSuspicious = false;
    let isSafe = false;
    let moderationResults: ModerationResultType[] = [];
    const createdAt = new Date();

    for (const object of partToAnalyze) {
      const moderationResponse = await moderateContent({
        content: [
          {
            type: "image_url",
            image_url: { url: await urlToBase64(object.mainUrl.url) },
          },
        ],
      });

      isSafe = moderationResponse.isSafe;
      isSuspicious = isSuspicious
        ? isSuspicious
        : moderationResponse.isSuspicious;
      moderationResults.push(...moderationResponse.moderationResults);

      if (!isSafe) {
        addModerationAnalyticsData({
          categoryName,
          isSafe,
          moderationResults,
          isSuspicious,
          userId,
        });
        throw httpError(
          `It looks like your image contains inappropriate content. Try a different one.`
        );
      }

      const isSelf = await checkIfSelf({
        image: object.mainUrl.url,
        userId,
        categoryName,
      });

      if (!isSelf) {
        throw httpError(`You can only upload images of yourself.`);
      }
    }

    await incrementProgress({ value: 5, operationKey: "progress", userId });

    const partResult = { part, concerns: [] } as PartResultType;

    let scores: FormattedRatingType = { overall: 0 };
    let scoresDifference: FormattedRatingType = { overall: 0 };
    let newConcerns: UserConcernType[] = [];

    let initialProgress = (await doWithRetries(async () =>
      db
        .collection("Progress")
        .find({
          part,
          userId: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        })
        .project({ scores: 1, images: 1, createdAt: 1 })
        .sort({ createdAt: 1 })
        .next()
    )) as unknown as LocalProgressType;

    if (enableScanAnalysis) {
      const imageObjects = toAnalyze.map((tAo) => ({
        part: tAo.part,
        position: tAo.position,
        url: tAo.mainUrl.url,
      }));

      const response = await getScoresAndFeedback({
        categoryName,
        currentPartConcerns: partConcerns,
        part,
        sex: demographics.sex,
        imageObjects,
        userId,
        initialScores: initialProgress?.scores,
      });

      scores = response.scores;
      scoresDifference = response.scoresDifference;
      newConcerns = response.concerns;
      partResult.concerns = newConcerns;
    }

    const images = partToAnalyze.map((record: ToAnalyzeType) => ({
      position: record.position,
      mainUrl: record.mainUrl,
      urls: record.contentUrlTypes,
    }));

    const updatedImages = await updateProgressImages({
      currentImages: images,
      blurType,
      cookies,
    });

    const isPublic = await checkIfPublic({ userId, part });

    const recordOfProgress: ProgressType = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      part,
      scores,
      demographics,
      images: updatedImages,
      initialImages: initialProgress?.images || updatedImages,
      initialDate: initialProgress?.createdAt || createdAt,
      createdAt,
      userName: name,
      concerns: newConcerns,
      scoresDifference,
      specialConsiderations,
      isPublic,
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    const beforeAfterUpdate: BeforeAfterType = {
      images: updatedImages,
      part,
      scores,
      demographics,
      isPublic,
      concerns: newConcerns,
      updatedAt: new Date(),
      avatar,
      userName: name,
      initialDate: initialProgress?.createdAt || createdAt,
      initialImages: initialProgress?.images || updatedImages,
      scoresDifference,
    };

    const updateOperation: any = {
      $set: beforeAfterUpdate,
    };

    await doWithRetries(async () =>
      db.collection("Progress").insertOne(recordOfProgress)
    );

    await doWithRetries(async () =>
      db
        .collection("BeforeAfter")
        .updateOne({ userId: new ObjectId(userId), part }, updateOperation, {
          upsert: true,
        })
    );

    partResult.latestScores = scores;
    partResult.scoresDifference = scoresDifference;
    partResult.latestProgress = recordOfProgress;

    if (moderationResults.length > 0) {
      addModerationAnalyticsData({
        categoryName,
        isSafe,
        moderationResults,
        isSuspicious,
        userId,
      });

      if (isSuspicious) {
        addSuspiciousRecord({
          collection: SuspiciousRecordCollectionEnum.PROGRESS,
          moderationResults,
          contentId: String(recordOfProgress._id),
          userId,
        });
      }
    }

    return partResult;
  } catch (err) {
    throw httpError(err);
  }
}
