import { PartEnum, ScoreType } from "@/types.js";
import { ObjectId } from "mongodb";

export type RoutineSuggestionTaskType = {
  icon: string;
  task: string;
  numberOfTimesInAMonth: number;
  concern: string;
  color: string;
};

export type RoutineSuggestionType = {
  _id: ObjectId;
  userId: ObjectId;
  part: PartEnum;
  lastCreatedOn: string;
  questionsAndAnswers: { [question: string]: string };
  tasks: { [key: string]: RoutineSuggestionTaskType[] };
  summary: string;
  reasoning: string;
  concernScores: ScoreType[];
  previousExperience: {
    [key: string]: string;
  };
  isRevised: boolean;
  revisionText?: string;
};
