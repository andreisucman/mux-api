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
  LatestScoresDifferenceType,
} from "types.js";
import analyzePart from "functions/analyzePart.js";
import { db } from "init.js";
import { ModerationStatusEnum } from "types.js";
import httpError from "@/helpers/httpError.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import updateAnalytics from "./updateAnalytics.js";
import updateNextScan from "@/helpers/updateNextScan.js";
import { combineAndDeduplicateArrays, delayExecution } from "@/helpers/utils.js";

type Props = {
  userId: string;
  name: string;
  nextScan: NextActionType[];
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
  latestConcernScoresDifference: LatestScoresDifferenceType;
};

export default async function analyzeAppearance({
  userId,
  name,
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
      const currentPartConcerns = allConcerns.filter((aco) => aco.part === part);
      const partUserUploadedConcernObjects = userUploadedConcerns.filter((co) => co.part === part);
      const uniqueActivePartConcerns = Array.from(
        new Set([...currentPartConcerns.map((co) => co.name), ...partUserUploadedConcernObjects.map((co) => co.name)])
      );

      return doWithRetries(async () =>
        analyzePart({
          name,
          club,
          part: part as PartEnum,
          userId,
          categoryName,
          demographics,
          toAnalyze,
          partUserUploadedConcerns: uniqueActivePartConcerns,
          specialConsiderations: rephrasedSpecialConsiderations,
        })
      );
    });

    const analysesResults = await Promise.all(analyzePartPromises);

    const partsAnalyzed = analysesResults.map((rec) => rec.part);

    const newConcerns = analysesResults.flatMap((rec) => rec.concerns);
    const zeroValueConcernNames = analysesResults.flatMap((rec) => rec.zeroValueConcerns).map((co) => co.name);

    const deduplicatedConcerns = combineAndDeduplicateArrays(allConcerns, newConcerns, "name").filter(
      (co) => !zeroValueConcernNames.includes(co.name)
    );

    toUpdateUser.$set.concerns = deduplicatedConcerns;

    const newLatestConcernScores = analysesResults.reduce((a: { [key: string]: any }, c) => {
      const oldScores = latestConcernScores[c.part] || [];
      const combined = combineAndDeduplicateArrays(oldScores, c.latestConcernScores, "name");
      a[c.part] = combined;
      return a;
    }, {});

    const newLatestConcernScoresDifference = analysesResults.reduce((a: { [key: string]: any }, c) => {
      const oldDifferences = latestConcernScoresDifference[c.part] || [];
      const combined = combineAndDeduplicateArrays(oldDifferences, c.concernScoresDifference, "name");
      a[c.part] = combined;
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

    await delayExecution(20000);

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "progress" },
          { $set: { isRunning: false, progress: 0 }, $unset: { createdAt: null } }
        )
    );

    const partScansIncrementPayload = partsAnalyzed.map((p) => `overview.user.usage.scans.scanParts.${p}`);

    const partScansIncrementMap = partScansIncrementPayload.reduce((a, c) => {
      a[c] = 1;
      return a;
    }, {});

    updateAnalytics({
      userId,
      incrementPayload: {
        ...partScansIncrementMap,
        "overview.user.usage.scans.totalScans": 1,
      },
    });

    console.timeEnd("analyzeAppearance - finalization");
  } catch (err) {
    throw httpError(err);
  }
}
