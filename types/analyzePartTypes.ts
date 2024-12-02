import { UserConcernType, FormattedRatingType, ProgressType } from "types.js";

export type PartResultType = {
  part: string;
  concerns: UserConcernType[];
  potential: FormattedRatingType;
  currentlyHigherThan: number;
  potentiallyHigherThan: number;
  latestScores: FormattedRatingType;
  scoresDifference: { [key: string]: number };
  latestProgress: ProgressType;
};
