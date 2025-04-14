import { UserConcernType, ScoreType, ScoreDifferenceType, ProgressImageType } from "types.js";

export type PartResultType = {
  part: string;
  concerns: UserConcernType[];
  latestConcernScores: ScoreType[];
  concernScoresDifference: ScoreDifferenceType[];
  latestProgressImages: ProgressImageType[];
};
