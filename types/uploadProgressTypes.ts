import { PartEnum, LatestProgressType, NextActionType, ProgressImageType, LatestProgressImagesType } from "@/types.js";

import { ToAnalyzeType, UserConcernType, ClubDataType, DemographicsType, LatestScoresType } from "types.js";

export type ProgressType = {
  title: string;
  instruction: string;
  part: PartEnum | null;
};

export type UploadProgressUserInfo = {
  name: string;
  avatar: { [key: string]: any } | null;
  toAnalyze: ToAnalyzeType[];
  concerns: UserConcernType[];
  demographics: DemographicsType;
  country: string;
  timeZone: string;
  nextScan: NextActionType[];
  specialConsiderations?: string;
  latestProgressImages: LatestProgressImagesType;
  latestConcernScores: LatestScoresType;
  latestConcernScoresDifference: LatestScoresType;
  club: ClubDataType;
};
