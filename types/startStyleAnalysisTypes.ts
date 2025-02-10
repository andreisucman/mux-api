import {
  ClubDataType,
  DemographicsType,
  LatestScoresType,
  StyleAnalysisType,
} from "types.js";

export type StartStyleAnalysisUserInfoType = {
  name: string;
  avatar: { [key: string]: any };
  latestStyleAnalysis: StyleAnalysisType;
  latestScoresDifference: LatestScoresType;
  demographics: DemographicsType;
  club: ClubDataType;
};
