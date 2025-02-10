import { TypeEnum, PartEnum, PotentialType, LatestProgressType } from "@/types.js";

export type ProgressType = {
  type: TypeEnum | null;
  title: string;
  instruction: string;
  position: string;
  part: PartEnum | null;
};

import {
  ToAnalyzeType,
  UserConcernType,
  ClubDataType,
  DemographicsType,
  LatestScoresType,
  HigherThanType,
  NextActionType,
} from "types.js";

export type UploadProgressUserInfo = {
  name: string;
  avatar: { [key: string]: any } | null;
  requiredProgress: ProgressType[];
  nutrition: {
    dailyCalorieGoal: number | null;
    recommendedDailyCalorieGoal: number | null;
    remainingDailyCalories: number | null;
  };
  toAnalyze: ToAnalyzeType[];
  concerns: UserConcernType[];
  demographics: DemographicsType;
  potential: PotentialType;
  city: string;
  country: string;
  timeZone: string;
  currentlyHigherThan: HigherThanType;
  potentiallyHigherThan: HigherThanType;
  nextScan: NextActionType[];
  specialConsiderations?: string;
  latestProgress: LatestProgressType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  club: ClubDataType;
};
