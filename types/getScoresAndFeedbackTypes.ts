import { DemographicsType, LatestProgressType, LatestScoresType, UserConcernType } from "@/types.js";
import { ObjectId } from "mongodb";

export type GetScoresAndFeedbackUserType = {
  _id: ObjectId;
  demographics: DemographicsType;
  concerns: UserConcernType[];
  latestConcernScores: LatestScoresType;
  latestConcernScoresDifference: LatestScoresType;
  latestFeatureScores: LatestScoresType;
  latestFeatureScoresDifference: LatestScoresType;
  latestProgress: LatestProgressType;
};
