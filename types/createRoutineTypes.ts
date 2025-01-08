import { ObjectId } from "mongodb";
import {
  UserConcernType,
  RequiredSubmissionType,
  TypeEnum,
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

type DefaultSuggestionType = {
  itemId: string;
  asin: string;
  name: string;
  image: string;
  url: string;
  rating: number;
  description: string;
  suggestion: string;
  variant: string;
  type: "product" | "place";
  rank: number;
  reasoning: string;
  analysisResult: { [key: string]: boolean };
  key: string;
};

type TaskExampleType = { type: string; url: string };

export type CreateRoutineAllSolutionsType = {
  requiredSubmissions: RequiredSubmissionType[];
  instruction: string;
  description: string;
  requisite: string;
  icon: string;
  example: TaskExampleType;
  color: string;
  name: string;
  type: TypeEnum;
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
};
