import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  SexEnum,
  TypeEnum,
  LatestScoresType,
  ProgressType,
  UserPotentialRecordType,
  AgeIntervalEnum,
  HigherThanType,
} from "types.js";
import calculateHigherThanPart from "./calculateHigherThanPart.js";
import calculateHigherThanType from "./calculateHigherThanType.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

type Props = {
  userId: string;
  sex: SexEnum;
  currentlyHigherThan: HigherThanType;
  potentiallyHigherThan: HigherThanType;
  ageInterval: AgeIntervalEnum;
  potential: UserPotentialRecordType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  substituteProgressRecord: ProgressType;
};

function updateObject(
  overallObject: { [key: string]: { [key: string]: any } },
  type: string,
  part: string,
  partValue: number
) {
  const typeLatestObject = {
    ...overallObject[type as TypeEnum.HEAD],
    [part]: partValue,
  };

  const { overall, ...rest } = typeLatestObject;

  const restScoresValues = Object.values(rest).filter(
    (v) => typeof v === "number"
  );

  const newOverall = restScoresValues.reduce((a, c) => a + c, 0);

  typeLatestObject.overall = Math.round(newOverall / restScoresValues.length);

  const finalObject = {
    ...overallObject,
    [type]: typeLatestObject,
  };

  return finalObject;
}

export default async function recalculateLatestProgress({
  sex,
  userId,
  potential,
  ageInterval,
  latestScores,
  currentlyHigherThan,
  potentiallyHigherThan,
  latestScoresDifference,
  substituteProgressRecord,
}: Props) {
  try {
    const {
      type,
      part,
      potential: partPotential,
      scores,
      scoresDifference,
    } = substituteProgressRecord;

    const finalLatestScores = updateObject(
      latestScores,
      type,
      part,
      scores.overall
    );

    const finalLatestScoresDifference = updateObject(
      latestScoresDifference,
      type,
      part,
      scoresDifference.overall
    );

    const finalLatestPotential = updateObject(
      potential,
      type,
      part,
      partPotential.overall
    );

    const { partCurrentlyHigherThan, partPotentiallyHigherThan } =
      await calculateHigherThanPart({
        userId,
        currentScore: finalLatestScores[type][part].overall,
        potentialScore: finalLatestPotential[type][part].overall,
        ageInterval,
        sex,
        type,
        part,
      });

    const finalCurrentlyHigherThan = updateObject(
      currentlyHigherThan,
      type,
      part,
      partCurrentlyHigherThan
    );

    const finalPotentiallyHigherThan = updateObject(
      potentiallyHigherThan,
      type,
      part,
      partPotentiallyHigherThan
    );

    const { typeCurrentlyHigherThan, typePotentiallyHigherThan } =
      await calculateHigherThanType({
        userId,
        currentScore: finalLatestScores[type].overall,
        potentialScore: finalLatestPotential[type].overall,
        ageInterval,
        sex,
        type,
      });

    finalCurrentlyHigherThan[type].overall = typeCurrentlyHigherThan;
    finalPotentiallyHigherThan[type].overall = typePotentiallyHigherThan;

    return {
      latestProgress: substituteProgressRecord,
      potential: finalLatestPotential,
      latestScores: finalLatestScores,
      latestScoresDifference: finalLatestScoresDifference,
      currentlyHigherThan: finalCurrentlyHigherThan,
      potentiallyHigherThan: finalPotentiallyHigherThan,
    };
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
