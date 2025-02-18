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
  nutrition: {
    dailyCalorieGoal: number | null;
    remainingDailyCalories: number | null;
  };
  toAnalyze: ToAnalyzeType[];
  concerns: UserConcernType[];
  demographics: DemographicsType;
  city: string;
  country: string;
  timeZone: string;
  nextScan: NextActionType[];
  specialConsiderations?: string;
  latestProgress: LatestProgressType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  club: ClubDataType;
};
