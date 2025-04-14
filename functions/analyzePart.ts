import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  DemographicsType,
  ToAnalyzeType,
  UserConcernType,
  ClubDataType,
  PartEnum,
  ProgressImageType,
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
import createProgressRecords from "./createProgressRecords.js";

type Props = {
  userId: string;
  name: string;
  avatar: { [key: string]: any } | null;
  part: PartEnum;
  club: ClubDataType;
  specialConsiderations: string;
  demographics: DemographicsType;
  toAnalyze: ToAnalyzeType[];
  categoryName: CategoryNameEnum;
  userUploadedConcerns: UserConcernType[];
};

type LocalProgressType = {
  _id: ObjectId;
  concernScore: ScoreType;
  images: ProgressImageType[];
  createdAt: Date;
};

export default async function analyzePart({
  userId,
  name,
  avatar,
  part,
  categoryName,
  demographics,
  userUploadedConcerns,
  specialConsiderations,
  toAnalyze,
}: Props): Promise<PartResultType> {
  try {
    const partToAnalyze = toAnalyze.filter((obj) => obj.part === part);
    const partUserUploadedConcerns = userUploadedConcerns.filter((obj) => obj.part === part);
    const concernNames = partUserUploadedConcerns.map((obj) => obj.name);

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

    let initialProgresses = (await doWithRetries(async () =>
      db
        .collection("Progress")
        .find({
          userId: new ObjectId(userId),
          "concernScore.name": { $in: concernNames },
          moderationStatus: ModerationStatusEnum.ACTIVE,
        })
        .project({ concernScore: 1, images: 1, createdAt: 1 })
        .sort({ _id: 1 })
        .toArray()
    )) as unknown as LocalProgressType[];

    const imageObjects = toAnalyze.map((tAo) => ({
      part: tAo.part,
      url: tAo.mainUrl.url,
    }));

    const initialConcernScores = initialProgresses.map((obj) => obj.concernScore);

    const response = await getScoresAndFeedback({
      initialConcernScores,
      partUserUploadedConcerns,
      categoryName,
      imageObjects,
      userId,
      part,
    });

    concernScores = response.concernScores;
    concernScoresDifference = response.concernScoresDifference;

    newConcerns = response.concerns;
    partResult.concerns = newConcerns;

    const images = partToAnalyze.map((record: ToAnalyzeType) => ({
      mainUrl: record.mainUrl,
      urls: record.contentUrlTypes,
    }));

    const isPublicPromises = concernScores.map((so) => checkIfPublic({ userId, concern: so.name }));
    const isPublicResults = await Promise.all(isPublicPromises);

    const promises = newConcerns.map((co, i) => {
      const relevantConcernScore = concernScores.find((c) => c.name === co.name);
      const relevantConcernScoreDifference = concernScoresDifference.find((c) => c.name === co.name);
      const relevantInitialProgress = initialProgresses?.find((ip) => ip.concernScore.name === co.name);
      const initialDate = relevantInitialProgress?.createdAt || createdAt;
      const initialImages = relevantInitialProgress?.images || images;
      const relevantIsPublic = isPublicResults.find((io) => io.concern === co.name);

      return createProgressRecords({
        userId: new ObjectId(userId),
        avatar,
        concern: co.name,
        concernScore: relevantConcernScore,
        concernScoreDifference: relevantConcernScoreDifference,
        createdAt,
        demographics,
        featureScores,
        featureScoresDifference,
        initialDate,
        initialImages,
        isPublic: relevantIsPublic.isPublic,
        part,
        images,
        specialConsiderations,
        userName: name,
      });
    });

    const updatedIds = await Promise.all(promises);

    partResult.latestConcernScores = concernScores;
    partResult.concernScoresDifference = concernScoresDifference;
    partResult.latestFeatureScores = featureScores;
    partResult.featureScoresDifference = featureScoresDifference;
    partResult.latestProgressImages = images;

    if (moderationResults.length > 0) {
      addModerationAnalyticsData({
        categoryName,
        isSafe,
        moderationResults,
        isSuspicious,
        userId,
      });

      if (isSuspicious) {
        for (const item of updatedIds) {
          addSuspiciousRecord({
            collection: SuspiciousRecordCollectionEnum.PROGRESS,
            moderationResults,
            contentId: String(item.progressId),
            userId,
          });
        }
      }
    }

    return partResult;
  } catch (err) {
    throw httpError(err);
  }
}
