import {
  ClubDataType,
  DemographicsType,
  LatestScoresType,
  StyleAnalysisType,
  UserProgressRecordType,
} from "types.js";

export type PublishToClubUserInfoType = {
  _id: string;
  latestStyleAnalysis: { head?: StyleAnalysisType; body?: StyleAnalysisType };
  latestScoresDifference: LatestScoresType;
  demographics: DemographicsType;
  latestProgress: UserProgressRecordType;
  club: ClubDataType;
};
