import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getFeaturesToAnalyze from "helpers/getFeaturesToAnalyze.js";
import analyzeFeature from "functions/analyzeFeature.js";
import analyzeConcerns from "functions/analyzeConcerns.js";
import analyzePotential from "functions/analyzePotential.js";
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

type Props = {
  userId: string;
  name: string;
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

    const partResult = { part, concerns: [] } as PartResultType;

    const featuresToAnalyze = getFeaturesToAnalyze({
      sex: demographics.sex,
      part,
    });

    const appearanceAnalysisResults = await doWithRetries(async () =>
      Promise.all(
        featuresToAnalyze.map((feature: string) =>
          doWithRetries(async () =>
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

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "progress" },
          { $inc: { progress: 2 } }
        )
    );

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

    const scoresAndExplanations = await analyzePotential({
      userId,
      categoryName,
      sex: demographics.sex,
      toAnalyze: partToAnalyze,
      ageInterval: demographics.ageInterval,
      listOfFeatures: featuresToAnalyze,
      analysisResults: appearanceAnalysisResults,
    });

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "progress" },
          { $inc: { progress: 6 } }
        )
    );

    partResult.potential = scoresAndExplanations;

    /* add the record of progress to the Progress collection*/
    const scores = formatRatings(appearanceAnalysisResults);

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
    });

    const recordOfProgress: ProgressType = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      part,
      scores,
      demographics,
      potential: scoresAndExplanations,
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

      const partPrivacy = progressPrivacy.types.find((pt) => pt.name === part);

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
