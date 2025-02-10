import { LatestScoresType, ProgressType, PotentialType } from "types.js";
import httpError from "@/helpers/httpError.js";

function updateObject(overallObject: { [key: string]: any }) {
  const { overall, explanations, ...rest } = overallObject;

  const restScoresValues = Object.values(rest).filter(
    (v) => typeof v === "number"
  );

  const newOverall = restScoresValues.reduce((a, c) => a + c, 0);

  overallObject.overall = Math.round(newOverall / restScoresValues.length);

  return overallObject;
}

type Props = {
  potential: PotentialType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  substituteProgressRecord: ProgressType;
};

export default async function recalculateLatestProgress({
  potential,
  latestScores,
  latestScoresDifference,
  substituteProgressRecord,
}: Props) {
  try {
    const finalLatestScores = updateObject(latestScores);

    const finalLatestScoresDifference = updateObject(latestScoresDifference);

    const finalLatestPotential = updateObject(potential);

    return {
      latestProgress: substituteProgressRecord,
      potential: finalLatestPotential,
      latestScores: finalLatestScores,
      latestScoresDifference: finalLatestScoresDifference,
    };
  } catch (err) {
    throw httpError(err);
  }
}
