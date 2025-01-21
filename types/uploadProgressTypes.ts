import { TypeEnum, PartEnum } from "@/types.js";

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
  UserProgressRecordType,
  ClubDataType,
  DemographicsType,
  UserPotentialRecordType,
  LatestScoresType,
  HigherThanType,
  NextActionType,
} from "types.js";

export type UploadProgressUserInfo = {
  name: string;
  avatar: { [key: string]: any } | null;
  requiredProgress: {
    head: ProgressType[];
    body: ProgressType[];
  };
  nutrition: {
    dailyCalorieGoal: number | null;
    recommendedDailyCalorieGoal: number | null;
    remainingDailyCalories: number | null;
  };
  toAnalyze: { head: ToAnalyzeType[]; body: ToAnalyzeType[] };
  concerns: UserConcernType[];
  demographics: DemographicsType;
  potential: UserPotentialRecordType;
  city: string;
  country: string;
  timeZone: string;
  currentlyHigherThan: HigherThanType;
  potentiallyHigherThan: HigherThanType;
  nextScan: NextActionType;
  specialConsiderations?: string;
  latestProgress: UserProgressRecordType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  club: ClubDataType;
};
