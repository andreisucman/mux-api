import { ObjectId } from "mongodb";

export type AboutQuestionType = {
  _id: ObjectId;
  userId: ObjectId;
  updatedAt: Date;
  question: string;
  answer: string | null;
  skipped: boolean;
  isPublic: boolean;
  asking: string;
};
