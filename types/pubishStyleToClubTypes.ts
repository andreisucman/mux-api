import {
  ClubDataType,
  DemographicsType,
  LatestScoresType,
  StyleAnalysisType,
  UserProgressRecordType,
} from "types.js";

export type PublishToClubUserInfoType = {
  _id: string;
  name: string;
  avatar: { [key: string]: any };
  latestStyleAnalysis: { head?: StyleAnalysisType; body?: StyleAnalysisType };
  latestScoresDifference: LatestScoresType;
  demographics: DemographicsType;
  latestProgress: UserProgressRecordType;
  club: ClubDataType;
};
