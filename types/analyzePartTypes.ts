import { UserConcernType, FormattedRatingType, ProgressType } from "types.js";

export type PartResultType = {
  part: string;
  concerns: UserConcernType[];
  latestScores: FormattedRatingType;
  scoresDifference: { [key: string]: number };
  latestProgress: ProgressType;
};
