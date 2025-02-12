import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getDemographics from "functions/getDemographics.js";
import rephraseUserNote from "functions/rephraseUserNote.js";
import {
  ClubDataType,
  DemographicsType,
  ToAnalyzeType,
  UserConcernType,
  NextActionType,
  BlurTypeEnum,
  CategoryNameEnum,
  PartEnum,
  LatestScoresType,
  LatestProgressType,
  PotentialType,
} from "types.js";
import analyzePart from "functions/analyzePart.js";
import { defaultRequiredProgress } from "data/defaultUser.js";
import updateNextScan from "helpers/updateNextScan.js";
import getCalorieGoal from "functions/getCalorieGoal.js";
import { db } from "init.js";
import { ModerationStatusEnum } from "types.js";
import httpError from "@/helpers/httpError.js";
import { CookieOptions } from "express";

type Props = {
  userId: string;
  name: string;
  cookies: CookieOptions;
  avatar: { [key: string]: any } | null;
  nutrition: { [key: string]: number };
  categoryName: CategoryNameEnum;
  blurType: BlurTypeEnum;
  defaultToUpdateUser?: { $set: { [key: string]: unknown } };
  club: ClubDataType;
  concerns: UserConcernType[] | null;
  toAnalyze: ToAnalyzeType[];
  newSpecialConsiderations: string;
  latestProgress: LatestProgressType;
  demographics: DemographicsType;
  potential: PotentialType;
  nextScan: NextActionType[];
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
  nutrition,
  concerns = [],
  categoryName,
  nextScan,
  latestProgress,
  potential,
  defaultToUpdateUser,
  latestScores,
  latestScoresDifference,
  toAnalyze,
  demographics,
  newSpecialConsiderations,
}: Props) {
  try {
    const parts = [...new Set(toAnalyze.map((obj) => obj.part))];

    const toUpdateUser = { $set: {} as { [key: string]: any } };

    if (defaultToUpdateUser) {
      toUpdateUser.$set = { ...(defaultToUpdateUser.$set || {}) };
    }

    toUpdateUser.$set = {
      ...toUpdateUser.$set,
      nextScan,
      toAnalyze,
      potential,
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
        demographicsKeys: nullValueGroups.map((g) => g[0]),
      });

      demographics = { ...(demographics || {}), ...newDemographics };
    }

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "progress" },
          { $inc: { progress: 3 } }
        )
    );

    toUpdateUser.$set.demographics = demographics;

    const hasBody = toAnalyze.some((obj) => obj.part === "body");
    if (hasBody) {
      const calories = await getCalorieGoal({
        userId,
        toAnalyze,
        categoryName,
      });

      toUpdateUser.$set.nutrition = {
        ...nutrition,
        recommendedDailyCalorieGoal: calories,
      };
    }

    toUpdateUser.$set.nextScan = updateNextScan({ nextScan, toAnalyze });

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

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "progress" },
          { $set: { isRunning: true, progress: 99 } }
        )
    );

    const newPotential = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.potential;
        a.overall += c.potential.overall;
        return a;
      },
      { overall: 0 }
    );

    newPotential.overall = Math.round(
      newPotential.overall / analysesResults.length
    );

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

    toUpdateUser.$set.potential = {
      ...potential,
      ...newPotential,
    };

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

    console.timeEnd("analyzeAppearance - finalization");
  } catch (err) {
    throw httpError(err);
  }
}
