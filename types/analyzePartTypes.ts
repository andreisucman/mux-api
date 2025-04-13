import { UserConcernType, ScoreType, ScoreDifferenceType, ProgressType } from "types.js";

export type PartResultType = {
  part: string;
  concerns: UserConcernType[];
  latestConcernScores: ScoreType[];
  concernScoresDifference: ScoreDifferenceType[];
  latestFeatureScores: ScoreType[];
  featureScoresDifference: ScoreDifferenceType[];
  latestProgress: ProgressType;
};
