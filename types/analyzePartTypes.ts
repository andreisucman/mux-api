import { UserConcernType, ScoreType, ScoreDifferenceType, ProgressImageType } from "types.js";

export type PartResultType = {
  part: string;
  concerns: UserConcernType[];
  latestConcernScores: ScoreType[];
  concernScoresDifference: ScoreDifferenceType[];
  latestFeatureScores: ScoreType[];
  featureScoresDifference: ScoreDifferenceType[];
  latestProgressImages: ProgressImageType[];
};
