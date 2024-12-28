import { ObjectId } from "mongodb";

export type AboutQuestionType = {
  _id: ObjectId;
  userId: ObjectId;
  updatedAt: string;
  question: string;
  answer: string;
  skipped: boolean;
  asking: string;
};
