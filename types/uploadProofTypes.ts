import {
  ClubDataType,
  DemographicsType,
  LatestScoresType,
  PartEnum,
  RequiredSubmissionType,
  TypeEnum,
} from "types.js";

export type UploadProofUserType = {
  club: ClubDataType;
  demographics: DemographicsType;
  latestScoresDifference: LatestScoresType;
  streakDates: {
    default: { [key: string]: Date };
    club: { [key: string]: Date };
  };
  timeZone: string;
  dailyCalorieGoal: number;
};

export type UploadProofTaskType = {
  name: string;
  key: string;
  color: string;
  part: PartEnum;
  type: TypeEnum;
  icon: string;
  concern: string;
  requisite: string;
  routineId: string;
  isRecipe: boolean;
  requiredSubmissions: RequiredSubmissionType[];
  restDays: number;
};
