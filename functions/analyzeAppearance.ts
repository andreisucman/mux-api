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
  NextActionType,
  LatestProgressImagesType,
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
  userUploadedConcerns: UserConcernType[];
  toAnalyze: ToAnalyzeType[];
  newSpecialConsiderations: string;
  latestProgressImages: LatestProgressImagesType;
  allConcerns: UserConcernType[];
  demographics: DemographicsType;
  latestConcernScores: LatestScoresType;
  latestConcernScoresDifference: LatestScoresType;
};

export default async function analyzeAppearance({
  userId,
  name,
  avatar,
  club,
  nextScan,
  allConcerns,
  categoryName,
  latestProgressImages,
  defaultToUpdateUser,
  latestConcernScores,
  userUploadedConcerns,
  latestConcernScoresDifference,
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

    const restConcerns = allConcerns.filter((co) => !partsAnalyzed.includes(co.part));
    toUpdateUser.$set.concerns = [...restConcerns, ...newConcerns];

    const newLatestConcernScores = analysesResults.reduce((a: { [key: string]: any }, c) => {
      a[c.part] = c.latestConcernScores;
      return a;
    }, {});

    const newLatestConcernScoresDifference = analysesResults.reduce((a: { [key: string]: any }, c) => {
      a[c.part] = c.concernScoresDifference;
      return a;
    }, {});

    await incrementProgress({
      value: 99,
      operation: "set",
      operationKey: "progress",
      userId,
    });

    const newLatestProgressImages = analysesResults.reduce((a: { [key: string]: any }, c) => {
      a[c.part] = c.latestProgressImages;
      return a;
    }, {});

    toUpdateUser.$set.latestConcernScores = {
      ...latestConcernScores,
      ...newLatestConcernScores,
    };

    toUpdateUser.$set.latestConcernScoresDifference = {
      ...latestConcernScoresDifference,
      ...newLatestConcernScoresDifference,
    };

    toUpdateUser.$set.latestProgressImages = {
      ...latestProgressImages,
      ...newLatestProgressImages,
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
