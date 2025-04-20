import { LatestScoresDifferenceType, LatestScoresType, ProgressImageType } from "types.js";
import httpError from "@/helpers/httpError.js";

function updateObject(overallObject: { [key: string]: any }) {
  const { overall, explanations, ...rest } = overallObject;

  const restScoresValues = Object.values(rest).filter((v) => typeof v === "number");

  const newOverall = restScoresValues.reduce((a, c) => a + c, 0);

  overallObject.overall = Math.round(newOverall / restScoresValues.length);

  return overallObject;
}

type Props = {
  latestConcernScores: LatestScoresType;
  latestConcernScoresDifference: LatestScoresDifferenceType;
  substituteProgressImagesRecord: ProgressImageType[];
};

export default async function recalculateLatestProgress({
  latestConcernScores,
  latestConcernScoresDifference,
  substituteProgressImagesRecord,
}: Props) {
  try {
    const finalLatestScores = updateObject(latestConcernScores);

    const finalLatestScoresDifference = updateObject(latestConcernScoresDifference);

    return {
      latestProgressImages: substituteProgressImagesRecord,
      latestConcernScores: finalLatestScores,
      latestConcernScoresDifference: finalLatestScoresDifference,
    };
  } catch (err) {
    throw httpError(err);
  }
}
