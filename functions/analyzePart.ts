import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  DemographicsType,
  ToAnalyzeType,
  UserConcernType,
  ProgressType,
  ClubDataType,
  PartEnum,
  ProgressImageType,
  BeforeAfterType,
  CategoryNameEnum,
  ScoreType,
  ScoreDifferenceType,
} from "types.js";
import addModerationAnalyticsData from "./addModerationAnalyticsData.js";
import addSuspiciousRecord, { SuspiciousRecordCollectionEnum } from "./addSuspiciousRecord.js";
import { ModerationStatusEnum } from "types.js";
import moderateContent, { ModerationResultType } from "./moderateContent.js";
import { PartResultType } from "@/types/analyzePartTypes.js";
import { db } from "init.js";
import checkIfSelf from "./checkIfSelf.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import getScoresAndFeedback from "./getScoresAndFeedback.js";
import { checkIfPublic } from "@/routes/checkIfPublic.js";

type Props = {
  userId: string;
  name: string;
  avatar: { [key: string]: any } | null;
  part: PartEnum;
  club: ClubDataType;
  specialConsiderations: string;
  concerns: UserConcernType[] | null;
  demographics: DemographicsType;
  toAnalyze: ToAnalyzeType[];
  categoryName: CategoryNameEnum;
  userUploadedConcerns: Partial<UserConcernType>[];
};

type LocalProgressType = {
  _id: ObjectId;
  concernScores: ScoreType[];
  images: ProgressImageType[];
  createdAt: Date;
};

export default async function analyzePart({
  userId,
  name,
  avatar,
  part,
  concerns = [],
  categoryName,
  demographics,
  userUploadedConcerns,
  specialConsiderations,
  toAnalyze,
}: Props): Promise<PartResultType> {
  try {
    const partConcerns = concerns.filter((obj) => obj.part === part && !obj.isDisabled);
    const partToAnalyze = toAnalyze.filter((obj) => obj.part === part);
    const partUserUploadedConcerns = userUploadedConcerns.filter((obj) => obj.part === part);

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
      isSuspicious = isSuspicious ? isSuspicious : moderationResponse.isSuspicious;
      moderationResults.push(...moderationResponse.moderationResults);

      if (!isSafe) {
        addModerationAnalyticsData({
          categoryName,
          isSafe,
          moderationResults,
          isSuspicious,
          userId,
        });
        throw httpError(`It looks like your image contains inappropriate content. Try a different one.`);
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

    let concernScores: ScoreType[] = [];
    let concernScoresDifference: ScoreDifferenceType[] = [];
    let featureScores: ScoreType[] = [];
    let featureScoresDifference: ScoreDifferenceType[] = [];
    let newConcerns: UserConcernType[] = [];

    let initialProgress = (await doWithRetries(async () =>
      db
        .collection("Progress")
        .find({
          part,
          userId: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        })
        .project({ concernScores: 1, images: 1, createdAt: 1 })
        .sort({ createdAt: 1 })
        .next()
    )) as unknown as LocalProgressType;

    const imageObjects = toAnalyze.map((tAo) => ({
      part: tAo.part,
      url: tAo.mainUrl.url,
    }));

    const response = await getScoresAndFeedback({
      currentPartConcerns: partConcerns,
      initialConcernScores: initialProgress?.concernScores,
      partUserUploadedConcerns,
      categoryName,
      imageObjects,
      userId,
      part,
    });

    concernScores = response.concernScores;
    concernScoresDifference = response.concernScoresDifference;
    featureScores = response.featureScores;
    featureScoresDifference = response.featureScoresDifference;

    newConcerns = response.concerns;
    partResult.concerns = newConcerns;

    const images = partToAnalyze.map((record: ToAnalyzeType) => ({
      mainUrl: record.mainUrl,
      urls: record.contentUrlTypes,
    }));

    const isPublic = await checkIfPublic({ userId, part });

    const recordOfProgress: ProgressType = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      part,
      demographics,
      images,
      initialImages: initialProgress?.images || images,
      initialDate: initialProgress?.createdAt || createdAt,
      createdAt,
      userName: name,
      concerns: newConcerns,
      concernScores,
      concernScoresDifference,
      featureScores,
      featureScoresDifference,
      specialConsiderations,
      isPublic,
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    const beforeAfterUpdate: BeforeAfterType = {
      images,
      part,
      demographics,
      isPublic,
      avatar,
      userName: name,
      concerns: newConcerns,
      concernScores,
      concernScoresDifference,
      featureScores,
      featureScoresDifference,
      updatedAt: new Date(),
      initialDate: initialProgress?.createdAt || createdAt,
      initialImages: initialProgress?.images || images,
    };

    const updateOperation: any = {
      $set: beforeAfterUpdate,
    };

    await doWithRetries(async () => db.collection("Progress").insertOne(recordOfProgress));

    await doWithRetries(async () =>
      db.collection("BeforeAfter").updateOne({ userId: new ObjectId(userId), part }, updateOperation, {
        upsert: true,
      })
    );

    partResult.latestConcernScores = concernScores;
    partResult.concernScoresDifference = concernScoresDifference;
    partResult.latestFeatureScores = featureScores;
    partResult.featureScoresDifference = featureScoresDifference;

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
