import { ScoreType, ScoreDifferenceType, ProgressImageType, UserConcernType } from "types.js";

export type PartResultType = {
  part: string;
  concerns: UserConcernType[];
  latestConcernScores: ScoreType[];
  concernScoresDifference: ScoreDifferenceType[];
  latestProgressImages: ProgressImageType[];
  zeroValueConcerns: UserConcernType[]
};
