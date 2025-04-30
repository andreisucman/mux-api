import { UserConcernType, RecipeType, NextActionType } from "@/types.js";
import { ObjectId } from "mongodb";

export type CreateRoutineUserInfoType = {
  _id: ObjectId;
  concerns: UserConcernType[];
  name: string;
  timeZone: string;
  nextRoutine: NextActionType[];
  specialConsiderations: string;
};

export type TaskExampleType = { type: string; url: string };

export type CreateRoutineAllSolutionsType = {
  instruction: string;
  description: string;
  requisite: string;
  icon: string;
  examples: TaskExampleType[];
  color: string;
  name: string;
  key: string;
  productTypes: string[];
  isDish: boolean;
  previousRecipe: RecipeType;
  restDays: number;
};

export type CreateRoutineProgressRecordType = {
  images: { image: string }[];
};

export type PersonalizedInfoType = {
  name: string;
  key: string;
  instruction?: string;
  productTypes: string[];
};
