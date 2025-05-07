import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  DemographicsType,
  ToAnalyzeType,
  ClubDataType,
  PartEnum,
  ProgressImageType,
  CategoryNameEnum,
  ScoreType,
  ScoreDifferenceType,
  BeforeAfterType,
  ProgressType,
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
  part: PartEnum;
  club: ClubDataType;
  specialConsiderations: string;
  demographics: DemographicsType;
  toAnalyze: ToAnalyzeType[];
  categoryName: CategoryNameEnum;
  partUserUploadedConcerns: string[];
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
  part,
  categoryName,
  demographics,
  partUserUploadedConcerns,
  specialConsiderations,
  toAnalyze,
}: Props): Promise<PartResultType> {
  try {
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
      isSuspicious = isSuspicious ? isSuspicious : moderationResponse.isSuspicious;
      moderationResults.push(...moderationResponse.moderationResults);

      if (!isSafe) {
        addModerationAnalyticsData({
          categoryName,
          isSafe,
          moderationResults,
          isSuspicious,
          userId,
          userType: "user",
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
    let newConcerns: string[] = [];
    let zeroValueConcerns: string[] = [];

    let initialProgress = (await doWithRetries(async () =>
      db
        .collection("Progress")
        .find({
          userId: new ObjectId(userId),
          concerns: { $in: partUserUploadedConcerns },
          moderationStatus: ModerationStatusEnum.ACTIVE,
        })
        .project({ concernScores: 1, images: 1, createdAt: 1 })
        .sort({ _id: 1 })
        .next()
    )) as unknown as LocalProgressType;

    const toAnalyzeImages = toAnalyze.map((tAo) => tAo.mainUrl.url);

    const response = await getScoresAndFeedback({
      initialConcernScores: initialProgress?.concernScores,
      partUserUploadedConcerns,
      categoryName,
      toAnalyzeImages,
      userId,
      part,
    });

    concernScores = response.concernScores;
    concernScoresDifference = response.concernScoresDifference;
    newConcerns = response.concerns;
    zeroValueConcerns = response.zeroValueConcerns;

    const images = partToAnalyze.map((record: ToAnalyzeType) => ({
      mainUrl: record.mainUrl,
      urls: record.contentUrlTypes,
    }));

    const initialDate = initialProgress?.createdAt || createdAt;
    const initialImages = initialProgress?.images || images;

    const recordOfProgress: ProgressType = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      part,
      demographics,
      images,
      initialImages,
      initialDate,
      createdAt,
      isPublic: false,
      userName: name,
      concerns: newConcerns,
      concernScores,
      concernScoresDifference,
      specialConsiderations,
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    const progressResponse = await doWithRetries(async () => db.collection("Progress").insertOne(recordOfProgress));

    const baPublicityPromises = concernScores.map((so) => checkIfPublic({ userId, concern: so.name }));
    const baPublicityResults = await Promise.all(baPublicityPromises);

    recordOfProgress.isPublic = baPublicityResults.some((co) => Boolean(co.isPublic));

    const updateBAPromises = newConcerns.map((concern) => {
      const relevantConcernScore = concernScores.find((c) => c.name === concern);
      const relevantConcernScoreDifference = concernScoresDifference.find((c) => c.name === concern);
      const relevantPublicityVerdict = baPublicityResults.find((o) => o.concern === concern);

      const beforeAfterUpdate: Partial<BeforeAfterType> = {
        images,
        isPublic: relevantPublicityVerdict.isPublic,
        concernScore: relevantConcernScore,
        concernScoreDifference: relevantConcernScoreDifference,
        updatedAt: new Date(),
      };

      return doWithRetries(async () =>
        db
          .collection("BeforeAfter")
          .updateOne({ userId: new ObjectId(userId), concern, part }, { $set: beforeAfterUpdate })
      );
    });

    await Promise.all(updateBAPromises);

    partResult.latestProgressImages = images;
    partResult.latestConcernScores = concernScores;
    partResult.concernScoresDifference = concernScoresDifference;
    partResult.concerns = newConcerns.map((name) => ({ name, part }));
    partResult.zeroValueConcerns = zeroValueConcerns.map((name) => ({ name, part }));

    if (moderationResults.length > 0) {
      addModerationAnalyticsData({
        categoryName,
        isSafe,
        moderationResults,
        isSuspicious,
        userId,
        userType: "user",
      });

      if (isSuspicious) {
        addSuspiciousRecord({
          collection: SuspiciousRecordCollectionEnum.PROGRESS,
          moderationResults,
          contentId: String(progressResponse.insertedId),
          userId,
        });
      }
    }

    return partResult;
  } catch (err) {
    throw httpError(err);
  }
}
