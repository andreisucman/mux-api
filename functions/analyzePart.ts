import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getFeaturesToAnalyze from "helpers/getFeaturesToAnalyze.js";
import analyzeFeature from "functions/analyzeFeature.js";
import analyzeConcerns from "functions/analyzeConcerns.js";
import formatRatings from "@/helpers/formatRatings.js";
import {
  DemographicsType,
  ToAnalyzeType,
  UserConcernType,
  ProgressType,
  ClubDataType,
  PartEnum,
  BlurTypeEnum,
  PrivacyType,
  ProgressImageType,
  BeforeAfterType,
  CategoryNameEnum,
  FormattedRatingType,
} from "types.js";
import addModerationAnalyticsData from "./addModerationAnalyticsData.js";
import addSuspiciousRecord from "./addSuspiciousRecord.js";
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
import { FeatureAnalysisType } from "types.js";
import compareFeatureProgress from "./compareFeatureProgress.js";
import { FeatureAnalysisResultType } from "@/types/analyzeFeatureType.js";

type Props = {
  userId: string;
  name: string;
  cookies: CookieOptions;
  avatar: { [key: string]: any } | null;
  blurType: BlurTypeEnum;
  part: PartEnum;
  club: ClubDataType;
  specialConsiderations: string;
  concerns: UserConcernType[] | null;
  demographics: DemographicsType;
  toAnalyze: ToAnalyzeType[];
  categoryName: CategoryNameEnum;
};

export default async function analyzePart({
  userId,
  name,
  avatar,
  club,
  part,
  cookies,
  blurType,
  concerns = [],
  categoryName,
  demographics,
  specialConsiderations,
  toAnalyze,
}: Props): Promise<PartResultType> {
  try {
    const partConcerns = concerns.filter((obj) => obj.part === part);
    const partToAnalyze = toAnalyze.filter((obj) => obj.part === part);

    let isSuspicious = false;
    let isSafe = false;
    let moderationResults: ModerationResultType[] = [];

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

    await incrementProgress({ value: 1, operationKey: "progress", userId });

    const partResult = { part, concerns: [] } as PartResultType;

    const featuresToAnalyze = getFeaturesToAnalyze({
      sex: demographics.sex,
      part,
    });

    let appearanceAnalysisResults: FeatureAnalysisResultType[] = [];

    const previousScans = await doWithRetries(
      async () =>
        db
          .collection("Progress")
          .find(
            { userId: new ObjectId(userId), part },
            { projection: { images: 1, scores: 1 } }
          )
          .sort({ createdAt: -1 })
          .toArray() as unknown as {
          images: ProgressImageType[];
          scores: FormattedRatingType;
        }[]
    );

    if (previousScans.length === 0) {
      // first scan case
      appearanceAnalysisResults = await doWithRetries(async () =>
        Promise.all(
          featuresToAnalyze.map(async (feature: string) =>
            doWithRetries(() =>
              analyzeFeature({
                part,
                userId,
                feature,
                categoryName,
                sex: demographics.sex,
                toAnalyze: partToAnalyze,
              })
            )
          )
        )
      );
    } else {
      const previousImages = previousScans
        .flatMap((obj) => obj.images)
        .map((obj) => obj.mainUrl.url);

      const allPreviousExplanations = previousScans.flatMap(
        (obj) => obj.scores.explanations
      );

      appearanceAnalysisResults = await doWithRetries(async () =>
        Promise.all(
          featuresToAnalyze.map(async (feature: string) => {
            const relevantPreviousExplanation = allPreviousExplanations.find(
              (obj) => obj.feature === feature
            );

            return doWithRetries(() =>
              compareFeatureProgress({
                part,
                userId,
                feature,
                categoryName,
                sex: demographics.sex,
                toAnalyze: partToAnalyze,
                previousImages,
                previousExplanation: relevantPreviousExplanation.explanation,
              })
            );
          })
        )
      );
    }

    await incrementProgress({ value: 1, operationKey: "progress", userId });

    const newConcerns = await analyzeConcerns({
      part,
      userId,
      categoryName,
      sex: demographics.sex,
      toAnalyze: partToAnalyze,
    });

    if (newConcerns && newConcerns.length > 0) {
      const uniqueConcerns = [...partConcerns, ...newConcerns].filter(
        (obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i
      );

      partResult.concerns = uniqueConcerns;
    }

    const createdAt = new Date();

    /* add the record of progress to the Progress collection*/
    const scores = formatRatings(appearanceAnalysisResults);

    scores.explanations = appearanceAnalysisResults.map(
      ({ feature, explanation }: FeatureAnalysisType) => ({
        feature,
        explanation,
      })
    );

    /* calculate the progress so far */
    let initialProgress = (await doWithRetries(async () =>
      db
        .collection("Progress")
        .find({
          userId: new ObjectId(userId),
          part,
          moderationStatus: ModerationStatusEnum.ACTIVE,
        })
        .project({ scores: 1, images: 1, createdAt: 1 })
        .sort({ createdAt: 1 })
        .next()
    )) as unknown as {
      _id: ObjectId;
      scores: { [key: string]: number };
      images: ProgressImageType[];
      createdAt: Date;
    };

    let initialScores: { [key: string]: number } = scores;

    if (initialProgress) initialScores = initialProgress.scores;

    const newScoresDifference = Object.keys(initialScores).reduce(
      (a: { [key: string]: number }, key) => {
        a[key] = Number(scores[key]) - Number(initialScores[key]);
        return a;
      },
      {}
    );

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
      concerns: newConcerns,
      scoresDifference: newScoresDifference,
      specialConsiderations,
      isPublic: false,
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    const beforeAfterUpdate: BeforeAfterType = {
      images,
      part,
      scores,
      demographics,
      isPublic: false,
      concerns: newConcerns,
      updatedAt: new Date(),
      initialDate: initialProgress?.createdAt || createdAt,
      initialImages: initialProgress?.images || updatedImages,
      scoresDifference: newScoresDifference,
    };

    if (club) {
      const progressPrivacy = club.privacy.find(
        (rec: PrivacyType) => rec.name === "progress"
      );

      const partPrivacy = progressPrivacy.parts.find((pt) => pt.name === part);

      recordOfProgress.isPublic = partPrivacy.value;
      beforeAfterUpdate.isPublic = partPrivacy.value;

      recordOfProgress.avatar = avatar;
      recordOfProgress.userName = name;
      beforeAfterUpdate.avatar = avatar;
      beforeAfterUpdate.userName = name;
    }

    await doWithRetries(async () =>
      db.collection("Progress").insertOne(recordOfProgress)
    );

    await doWithRetries(async () =>
      db
        .collection("BeforeAfter")
        .updateOne(
          { userId: new ObjectId(userId), part },
          { $set: beforeAfterUpdate },
          { upsert: true }
        )
    );

    partResult.latestScores = scores;
    partResult.scoresDifference = newScoresDifference;
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
          collection: "Progress",
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
