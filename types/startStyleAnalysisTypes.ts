import {
  ClubDataType,
  DemographicsType,
  LatestScoresType,
  StyleAnalysisType,
} from "types.js";

export type StartStyleAnalysisUserInfoType = {
  latestStyleAnalysis: { head?: StyleAnalysisType; body?: StyleAnalysisType };
  latestScoresDifference: LatestScoresType;
  demographics: DemographicsType;
  club: ClubDataType;
};
