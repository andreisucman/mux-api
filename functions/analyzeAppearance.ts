import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getDemographics from "functions/getDemographics.js";
import rephraseUserNote from "functions/rephraseUserNote.js";
import {
  ClubDataType,
  DemographicsType,
  ToAnalyzeType,
  TypeEnum,
  UserProgressRecordType,
  UserConcernType,
  UserPotentialRecordType,
  LatestScoresType,
  HigherThanType,
  NextActionType,
  BlurTypeEnum,
} from "types.js";
import calculateHigherThanType from "functions/calculateHigherThanType.js";
import analyzePart from "functions/analyzePart.js";
import { defaultRequiredProgress } from "data/defaultUser.js";
import updateNextScan from "helpers/updateNextScan.js";
import getCalorieGoal from "functions/getCalorieGoal.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  type: TypeEnum;
  blurType: BlurTypeEnum;
  defaultToUpdateUser?: { $set: { [key: string]: unknown } };
  club: ClubDataType;
  concerns: UserConcernType[];
  toAnalyze: {
    head: ToAnalyzeType[];
    body: ToAnalyzeType[];
    health?: ToAnalyzeType[];
  };
  newSpecialConsiderations: string;
  latestProgress: UserProgressRecordType;
  demographics: DemographicsType;
  currentlyHigherThan: HigherThanType;
  potentiallyHigherThan: HigherThanType;
  potential: UserPotentialRecordType;
  nextScan: NextActionType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
};

export default async function analyzeAppearance({
  userId,
  type,
  club,
  blurType,
  concerns,
  nextScan,
  latestProgress,
  potential,
  currentlyHigherThan,
  defaultToUpdateUser,
  potentiallyHigherThan,
  latestScores,
  latestScoresDifference,
  toAnalyze,
  demographics,
  newSpecialConsiderations,
}: Props) {
  try {
    console.timeEnd("analyzeAppearance preparation");

    const toAnalyzeObjects = toAnalyze[type as "head"];

    const parts = [...new Set(toAnalyzeObjects.map((obj) => obj.part))];

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
      currentlyHigherThan,
      potentiallyHigherThan,
      latestScoresDifference,
      requiredProgress: defaultRequiredProgress,
    };

    let rephrasedSpecialConsiderations: string;

    if (newSpecialConsiderations)
      rephrasedSpecialConsiderations = await rephraseUserNote({
        userId,
        userNote: newSpecialConsiderations,
      });

    if (!demographics || !demographics.bodyType) {
      console.time("analyzeAppearance - getDemographics");

      const newDemographics = await getDemographics({
        userId,
        toAnalyzeObjects,
        type,
      });

      demographics = { ...(demographics || {}), ...newDemographics };

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(userId), type },
            { $inc: { progress: 3 } }
          )
      );

      console.timeEnd("analyzeAppearance - getDemographics");
      toUpdateUser.$set.demographics = demographics;
    }

    if (type === "body") {
      const calories = await getCalorieGoal({ userId, toAnalyzeObjects });
      toUpdateUser.$set.dailyCalorieGoal = calories;
    }

    toUpdateUser.$set.nextScan = updateNextScan({ nextScan, toAnalyze, type });

    const analyzePartPromises = parts.map((part) => {
      return doWithRetries(async () =>
        analyzePart({
          club,
          type,
          part,
          userId,
          concerns,
          blurType,
          demographics,
          toAnalyzeObjects,
          specialConsiderations: rephrasedSpecialConsiderations,
        })
      );
    });

    const analysesResults = await Promise.all(analyzePartPromises);
    const partsAnalyzed = analysesResults.map((rec) => rec.part);

    const newTypeConcerns = analysesResults.flatMap((rec) => rec.concerns);
    const restOfConcerns = concerns.filter(
      (rec) => rec.type === type && !partsAnalyzed.includes(rec.part)
    );
    const allUniqueConcerns = [...restOfConcerns, ...newTypeConcerns].filter(
      (obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i
    );

    toUpdateUser.$set.concerns = allUniqueConcerns;

    const newTypeLatestScores = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.latestScores;
        a.overall += c.latestScores.overall;
        return a;
      },
      { overall: 0 }
    );
    newTypeLatestScores.overall = Math.round(
      newTypeLatestScores.overall / analysesResults.length
    );

    const newTypeLatestScoresDifference = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.scoresDifference;
        a.overall += c.scoresDifference.overall;
        return a;
      },
      { overall: 0 }
    );
    newTypeLatestScoresDifference.overall = Math.round(
      newTypeLatestScoresDifference.overall / analysesResults.length
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), type },
          { $set: { isRunning: true, progress: 99 } }
        )
    );

    const newTypePotential = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.potential;
        a.overall += c.potential.overall;
        return a;
      },
      { overall: 0 }
    );

    newTypePotential.overall = Math.round(
      newTypePotential.overall / analysesResults.length
    );

    const newTypeLatestProgress = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.latestProgress;
        a.overall += c.latestProgress.scores.overall;
        return a;
      },
      { overall: 0 }
    );
    newTypeLatestProgress.overall = Math.round(
      newTypeLatestProgress.overall / analysesResults.length
    );

    /* update the overall of type on each of its record */
    const toUpdateProgress = analysesResults.map((rec) => ({
      updateOne: {
        filter: { _id: new ObjectId(rec.latestProgress._id) },
        update: { $set: { overall: newTypeLatestProgress.overall } },
      },
    }));

    await doWithRetries(async () =>
      db.collection("Progress").bulkWrite(toUpdateProgress)
    );

    const { typeCurrentlyHigherThan, typePotentiallyHigherThan } =
      await calculateHigherThanType({
        userId,
        currentScore: newTypeLatestScores.overall,
        potentialScore: newTypePotential.overall,
        ageInterval: demographics.ageInterval,
        sex: demographics.sex,
        type,
      });

    const newTypeCurrentlyHigherThan = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.currentlyHigherThan;
        return a;
      },
      { overall: typeCurrentlyHigherThan }
    );

    const newTypePotentiallyHigherThan = analysesResults.reduce(
      (a: { [key: string]: any }, c) => {
        a[c.part] = c.potentiallyHigherThan;
        return a;
      },
      { overall: typePotentiallyHigherThan }
    );

    const finalTypePotential: any = {
      ...(potential?.[type] || {}),
      ...newTypePotential,
    };

    toUpdateUser.$set.potential = {
      ...potential,
      [type]: finalTypePotential,
    };

    const finalTypeCurrentlyHigherThan = {
      ...currentlyHigherThan[type],
      ...newTypeCurrentlyHigherThan,
    };

    toUpdateUser.$set.currentlyHigherThan = {
      ...currentlyHigherThan,
      [type]: finalTypeCurrentlyHigherThan,
    };

    const finalTypePotentiallyHigherThan = {
      ...potentiallyHigherThan[type],
      ...newTypePotentiallyHigherThan,
    };

    toUpdateUser.$set.potentiallyHigherThan = {
      ...potentiallyHigherThan,
      [type]: finalTypePotentiallyHigherThan,
    };

    const finalTypeLatestScores = {
      ...latestScores[type],
      ...newTypeLatestScores,
    };

    toUpdateUser.$set.latestScores = {
      ...latestScores,
      [type]: finalTypeLatestScores,
    };

    const finalTypeLatestScoresDifference = {
      ...latestScoresDifference[type],
      ...newTypeLatestScoresDifference,
    };

    toUpdateUser.$set.latestScoresDifference = {
      ...latestScoresDifference,
      [type]: finalTypeLatestScoresDifference,
    };

    const finalTypeLatestProgress = {
      ...latestProgress[type],
      ...newTypeLatestProgress,
    };

    toUpdateUser.$set.latestProgress = {
      ...latestProgress,
      [type]: finalTypeLatestProgress,
    };

    toUpdateUser.$set.toAnalyze[type] = [];

    await doWithRetries(async () =>
      db
        .collection("User")
        .updateOne({ _id: new ObjectId(userId) }, toUpdateUser)
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), type },
          { $set: { isRunning: false, progress: 0 } }
        )
    );
  } catch (err) {
    throw httpError(err);
  }
}
