import { ObjectId } from "mongodb";
import { ModerationStatusEnum, PartEnum } from "@/types.js";

export type DiaryRecordType = {
  _id: ObjectId;
  part: PartEnum;
  audio: string;
  embedding: number[];
  activity: DiaryActivityType[];
  userId: ObjectId;
  transcription: string;
  createdAt: Date;
  userName: string | null;
  isPublic: boolean;
  moderationStatus: ModerationStatusEnum;
  deletedOn?: Date;
};

export type DiaryActivityType = {
  contentId: ObjectId;
  name?: string;
  taskId?: ObjectId;
  url: string;
  thumbnail?: string;
  icon?: string;
  contentType: "image" | "video";
};
