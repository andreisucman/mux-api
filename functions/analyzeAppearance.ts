import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getDemographics from "functions/getDemographics.js";
import rephraseUserNote from "functions/rephraseUserNote.js";
import {
  ClubDataType,
  DemographicsType,
  ToAnalyzeType,
  UserConcernType,
  CategoryNameEnum,
  PartEnum,
  LatestScoresType,
  LatestProgressType,
  NextActionType,
} from "types.js";
import analyzePart from "functions/analyzePart.js";
import { db } from "init.js";
import { ModerationStatusEnum } from "types.js";
import httpError from "@/helpers/httpError.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import updateAnalytics from "./updateAnalytics.js";
import updateNextScan from "@/helpers/updateNextScan.js";

type Props = {
  userId: string;
  name: string;
  nextScan: NextActionType[];
  avatar: { [key: string]: any } | null;
  categoryName: CategoryNameEnum;
  defaultToUpdateUser?: { $set: { [key: string]: unknown } };
  club: ClubDataType;
  concerns: UserConcernType[] | null;
  userUploadedConcerns: Partial<UserConcernType>[];
  toAnalyze: ToAnalyzeType[];
  newSpecialConsiderations: string;
  latestProgress: LatestProgressType;
  demographics: DemographicsType;
  latestConcernScores: LatestScoresType;
  latestConcernScoresDifference: LatestScoresType;
  latestFeatureScores: LatestScoresType;
  latestFeatureScoresDifference: LatestScoresType;
};

export default async function analyzeAppearance({
  userId,
  name,
  avatar,
  club,
  nextScan,
  concerns = [],
  categoryName,
  latestProgress,
  defaultToUpdateUser,
  latestConcernScores,
  latestFeatureScores,
  userUploadedConcerns,
  latestConcernScoresDifference,
  latestFeatureScoresDifference,
  toAnalyze,
  demographics,
  newSpecialConsiderations,
}: Props) {
  try {
    const parts = [...new Set(toAnalyze.map((obj) => obj.part))];

    const toUpdateUser: { [key: string]: any } = { $set: {}, $inc: {} };

    if (defaultToUpdateUser) {
      toUpdateUser.$set = { ...(defaultToUpdateUser.$set || {}) };
    }

    toUpdateUser.$set = {
      ...toUpdateUser.$set,
      toAnalyze,
      latestConcernScores,
      demographics,
      latestConcernScoresDifference,
    };

    let rephrasedSpecialConsiderations: string;

    if (newSpecialConsiderations)
      rephrasedSpecialConsiderations = await rephraseUserNote({
        userId,
        userNote: newSpecialConsiderations,
        categoryName,
      });

    const nullValueGroups = Object.entries(demographics).filter((g) => g[1] === null);

    if (nullValueGroups.length > 0) {
      const newDemographics = await getDemographics({
        userId,
        toAnalyze,
        categoryName,
        demographicsKeys: Object.keys(demographics),
      });

      demographics = { ...(demographics || {}), ...newDemographics };
    }

    toUpdateUser.$set.demographics = demographics;
    toUpdateUser.$set.nextScan = updateNextScan({ nextScan, toAnalyze });

    const analyzePartPromises = parts.map((part) => {
      return doWithRetries(async () =>
        analyzePart({
          name,
          avatar,
          club,
          part: part as PartEnum,
          userId,
          concerns,
          userUploadedConcerns,
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

    const restOfConcerns = concerns.filter((rec) => !partsAnalyzed.includes(rec.part));

    const allUniqueConcerns = [...restOfConcerns, ...newConcerns].filter(
      (obj, i, arr) => arr.findIndex((o) => o.name === obj.name && o.part === obj.part) === i
    );

    allUniqueConcerns.sort((a, b) => a.importance - b.importance).map((co, i) => ({ ...co, importance: i + 1 }));

    toUpdateUser.$set.concerns = allUniqueConcerns;

    const newLatestConcernScores = analysesResults.reduce((a: { [key: string]: any }, c) => {
      a[c.part] = c.latestConcernScores;
      return a;
    }, {});

    const newLatestConcernScoresDifference = analysesResults.reduce((a: { [key: string]: any }, c) => {
      a[c.part] = c.concernScoresDifference;
      return a;
    }, {});

    const newLatestFeaturesScores = analysesResults.reduce((a: { [key: string]: any }, c) => {
      a[c.part] = c.latestFeatureScores;
      return a;
    }, {});

    const newLatestFeatureScoresDifference = analysesResults.reduce((a: { [key: string]: any }, c) => {
      a[c.part] = c.featureScoresDifference;
      return a;
    }, {});

    await incrementProgress({
      value: 99,
      operation: "set",
      operationKey: "progress",
      userId,
    });

    const newLatestProgress = analysesResults.reduce((a: { [key: string]: any }, c) => {
      a[c.part] = c.latestProgress;
      return a;
    }, {});

    toUpdateUser.$set.latestConcernScores = {
      ...latestConcernScores,
      ...newLatestConcernScores,
    };

    toUpdateUser.$set.latestFeatureScores = {
      ...latestFeatureScores,
      ...newLatestFeaturesScores,
    };

    toUpdateUser.$set.latestConcernScoresDifference = {
      ...latestConcernScoresDifference,
      ...newLatestConcernScoresDifference,
    };

    toUpdateUser.$set.latestFeatureScoresDifference = {
      ...latestFeatureScoresDifference,
      ...newLatestFeatureScoresDifference,
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

    const partScansIncrementPayload = partsAnalyzed.map((p) => `overview.usage.scans.scanParts.${p}`);

    const partScansIncrementMap = partScansIncrementPayload.reduce((a, c) => {
      a[c] = 1;
      return a;
    }, {});

    updateAnalytics({
      userId,
      incrementPayload: {
        ...partScansIncrementMap,
        "overview.usage.scans.totalScans": 1,
      },
    });

    console.timeEnd("analyzeAppearance - finalization");
  } catch (err) {
    throw httpError(err);
  }
}
