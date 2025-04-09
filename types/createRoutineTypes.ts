import { ObjectId } from "mongodb";
import { UserConcernType, RecipeType, DemographicsType, NextActionType, SuggestionType } from "@/types.js";

export type CreateRoutineUserInfoType = {
  _id: ObjectId;
  demographics: DemographicsType;
  concerns: UserConcernType[];
  name: string;
  country: string;
  timeZone: string;
  nextRoutine: NextActionType;
  specialConsiderations: string;
};

export type TaskExampleType = { type: string; url: string };

export type CreateRoutineAllSolutionsType = {
  instruction: string;
  description: string;
  requisite: string;
  icon: string;
  suggestions: SuggestionType[];
  examples: TaskExampleType[];
  color: string;
  name: string;
  key: string;
  productTypes: string[];
  isDish: boolean;
  recipe: RecipeType;
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
