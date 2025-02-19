import { ObjectId } from "mongodb";
import {
  UserConcernType,
  RecipeType,
  DemographicsType,
  NextActionType,
} from "@/types.js";
import { SuggestionType } from "./findTheBestVariant.js";

export type CreateRoutineUserInfoType = {
  _id: ObjectId;
  demographics: DemographicsType;
  concerns: UserConcernType[];
  city: string;
  name: string;
  country: string;
  timeZone: string;
  nextRoutine: NextActionType;
  specialConsiderations: string;
};

type TaskExampleType = { type: string; url: string };

export type CreateRoutineAllSolutionsType = {
  instruction: string;
  description: string;
  requisite: string;
  icon: string;
  suggestions: SuggestionType[];
  example: TaskExampleType;
  color: string;
  name: string;
  key: string;
  productTypes: string[];
  isRecipe: boolean;
  recipe: RecipeType;
  restDays: number;
};

export type CreateRoutineProgressRecordType = {
  images: { position: string; image: string }[];
};

export type PersonalizedInfoType = {
  name: string;
  key: string;
  instruction?: string;
  productTypes: string[];
};
