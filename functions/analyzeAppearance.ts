import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getDemographics from "functions/getDemographics.js";
import rephraseUserNote from "functions/rephraseUserNote.js";
import {
  ClubDataType,
  DemographicsType,
  ToAnalyzeType,
  UserConcernType,
  BlurTypeEnum,
  CategoryNameEnum,
  PartEnum,
  LatestScoresType,
  LatestProgressType,
} from "types.js";
import analyzePart from "functions/analyzePart.js";
import { defaultRequiredProgress } from "data/defaultUser.js";
import { db } from "init.js";
import { ModerationStatusEnum } from "types.js";
import httpError from "@/helpers/httpError.js";
import { CookieOptions } from "express";
import incrementProgress from "@/helpers/incrementProgress.js";
import updateAnalytics from "./updateAnalytics.js";

type Props = {
  userId: string;
  name: string;
  cookies: CookieOptions;
  avatar: { [key: string]: any } | null;
  categoryName: CategoryNameEnum;
  blurType: BlurTypeEnum;
  defaultToUpdateUser?: { $set: { [key: string]: unknown } };
  club: ClubDataType;
  enableScanAnalysis: boolean;
  concerns: UserConcernType[] | null;
  toAnalyze: ToAnalyzeType[];
  newSpecialConsiderations: string;
  latestProgress: LatestProgressType;
  demographics: DemographicsType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
};

export default async function analyzeAppearance({
  userId,
  name,
  avatar,
  club,
  cookies,
  blurType,
  concerns = [],
  categoryName,
  latestProgress,
  defaultToUpdateUser,
  latestScores,
  latestScoresDifference,
  enableScanAnalysis,
  toAnalyze,
  demographics,
  newSpecialConsiderations,
}: Props) {
  try {
    const parts = [...new Set(toAnalyze.map((obj) => obj.part))];

    const toUpdateUser: { [key: string]: any } = { $set: {}, $inc: {} };

    if (enableScanAnalysis) {
      toUpdateUser.$inc.scanAnalysisQuota = -1;
    } else {
      const relevantImages = toAnalyze.map((obj) => {
        const relevantImage = obj.contentUrlTypes.find(
          (o) => o.name === blurType
        );
        return relevantImage.url;
      });

      // needed for displaying on analysis page when feedback is not requested
      toUpdateUser.$set.latestScanImages = relevantImages;
    }

    if (defaultToUpdateUser) {
      toUpdateUser.$set = { ...(defaultToUpdateUser.$set || {}) };
    }

    toUpdateUser.$set = {
      ...toUpdateUser.$set,
      toAnalyze,
      latestScores,
      demographics,
      latestScoresDifference,
      requiredProgress: defaultRequiredProgress,
    };

    let rephrasedSpecialConsiderations: string;

    if (newSpecialConsiderations)
      rephrasedSpecialConsiderations = await rephraseUserNote({
        userId,
        userNote: newSpecialConsiderations,
        categoryName,
      });

    const nullValueGroups = Object.entries(demographics).filter(
      (g) => g[1] === null
    );

    if (nullValueGroups.length > 0) {
      const newDemographics = await getDemographics({
        userId,
        toAnalyze,
        categoryName,
        demographicsKeys: Object.keys(demographics),
      });

      demographics = { ...(demographics || {}), ...newDemographics };
    }

    await incrementProgress({
      value: 5,
      operationKey: "progress",
      userId: String(userId),
    });

    toUpdateUser.$set.demographics = demographics;

    const analyzePartPromises = parts.map((part) => {
      return doWithRetries(async () =>
        analyzePart({
          name,
          avatar,
          cookies,
          club,
          part: part as PartEnum,
          userId,
          concerns,
          blurType,
          categoryName,
          demographics,
          toAnalyze,
          enableScanAnalysis,
          specialConsiderations: rephrasedSpecialConsiderations,
        })
      );
    });

    const analysesResults = await Promise.all(analyzePartPromises);
    const partsAnalyzed = analysesResults.map((rec) => rec.part);

    const newConcerns = analysesResults.flatMap((rec) => rec.concerns);

    const restOfConcerns = concerns.filter(
      (rec) => !partsAnalyzed.includes(rec.part)
    );

    const allUniqueConcerns = [...restOfConcerns, ...newConcerns].filter(
      (obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i
    );

    toUpdateUser.$set.concerns = allUniqueConcerns;

    const newLatestScores = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.latestScores;
        a.overall += c.latestScores.overall;
        return a;
      },
      { overall: 0 }
    );

    newLatestScores.overall = Math.round(
      newLatestScores.overall / analysesResults.length
    );

    const newLatestScoresDifference = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.scoresDifference;
        a.overall += c.scoresDifference.overall;
        return a;
      },
      { overall: 0 }
    );

    newLatestScoresDifference.overall = Math.round(
      newLatestScoresDifference.overall / analysesResults.length
    );

    await incrementProgress({
      value: 99,
      operation: "set",
      operationKey: "progress",
      userId,
    });

    const newLatestProgress = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.latestProgress;
        a.overall += c.latestProgress.scores.overall;
        return a;
      },
      { overall: 0 }
    );

    newLatestProgress.overall = Math.round(
      newLatestProgress.overall / analysesResults.length
    );

    toUpdateUser.$set.latestScores = {
      ...latestScores,
      ...newLatestScores,
    };

    toUpdateUser.$set.latestScoresDifference = {
      ...latestScoresDifference,
      ...newLatestScoresDifference,
    };

    toUpdateUser.$set.latestProgress = {
      ...latestProgress,
      ...newLatestProgress,
    };

    toUpdateUser.$set.toAnalyze = [];

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        toUpdateUser
      )
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "progress" },
          { $set: { isRunning: false, progress: 0 } }
        )
    );

    const partScansIncrementPayload = partsAnalyzed.map(
      (p) => `overview.usage.scans.progressScanParts.${p}`
    );

    const partScansIncrementMap = partScansIncrementPayload.reduce((a, c) => {
      a[c] = 1;
      return a;
    }, {});

    updateAnalytics({
      userId,
      incrementPayload: {
        ...partScansIncrementMap,
        "overview.usage.scans.totalProgressScans": 1,
      },
    });

    console.timeEnd("analyzeAppearance - finalization");
  } catch (err) {
    throw httpError(err);
  }
}
