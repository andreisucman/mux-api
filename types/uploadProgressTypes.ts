import { PartEnum, LatestProgressType } from "@/types.js";

import {
  ToAnalyzeType,
  UserConcernType,
  ClubDataType,
  DemographicsType,
  LatestScoresType,
  NextActionType,
} from "types.js";

export type ProgressType = {
  title: string;
  instruction: string;
  position: string;
  part: PartEnum | null;
};

export type UploadProgressUserInfo = {
  name: string;
  avatar: { [key: string]: any } | null;
  requiredProgress: ProgressType[];
  toAnalyze: ToAnalyzeType[];
  concerns: UserConcernType[];
  demographics: DemographicsType;
  country: string;
  timeZone: string;
  nextScan: NextActionType[];
  scanAnalysisQuota: number;
  specialConsiderations?: string;
  latestProgress: LatestProgressType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  club: ClubDataType;
};
