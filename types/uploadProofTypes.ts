import { ObjectId } from "mongodb";
import {
  ClubDataType,
  DemographicsType,
  LatestScoresType,
  PartEnum,
  RecipeType,
} from "types.js";

export type UploadProofUserType = {
  name: string;
  avatar: { [key: string]: any } | null;
  club: ClubDataType;
  demographics: DemographicsType;
  latestScoresDifference: LatestScoresType;
  streakDates: {
    default: { [key: string]: Date };
    club: { [key: string]: Date };
  };
  timeZone: string;
  nutrition: {
    dailyCalorieGoal: number;
    remainingDailyCalories: number;
  };
};

export type UploadProofTaskType = {
  name: string;
  key: string;
  color: string;
  part: PartEnum;
  icon: string;
  concern: string;
  requisite: string;
  routineId: ObjectId;
  isRecipe: boolean;
  description: string;
  instruction: string;
  recipe: RecipeType;
  restDays: number;
  isCreated: boolean;
};
