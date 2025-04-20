import { ObjectId } from "mongodb";
import { ClubDataType, LatestScoresType, PartEnum, RecipeType } from "types.js";
import { TaskExampleType } from "./createRoutineTypes.js";

export type UploadProofUserType = {
  name: string;
  club: ClubDataType;
  latestScoresDifference: LatestScoresType;
  streakDates: { [key: string]: Date };
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
  isDish: boolean;
  description: string;
  instruction: string;
  previousRecipe: RecipeType;
  restDays: number;
  isCreated: boolean;
  startsAt: Date;
  examples: TaskExampleType[];
};
