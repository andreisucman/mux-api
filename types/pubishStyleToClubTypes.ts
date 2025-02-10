import {
  ClubDataType,
  DemographicsType,
  LatestProgressType,
  LatestScoresType,
  StyleAnalysisType,
} from "types.js";

export type PublishToClubUserInfoType = {
  _id: string;
  name: string;
  avatar: { [key: string]: any };
  latestStyleAnalysis: { head?: StyleAnalysisType; body?: StyleAnalysisType };
  latestScoresDifference: LatestScoresType;
  latestProgress: LatestProgressType;
  demographics: DemographicsType;
  club: ClubDataType;
};
