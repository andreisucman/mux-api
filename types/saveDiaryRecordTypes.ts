import { ObjectId } from "mongodb";
import { ModerationStatusEnum, PartEnum } from "@/types.js";

export type DiaryType = {
  _id: ObjectId;
  part: PartEnum;
  audio: string;
  activity: DiaryActivityType[];
  userId: ObjectId;
  transcription: string;
  createdAt: Date;
  userName: string | null;
  isPublic: boolean;
  moderationStatus: ModerationStatusEnum;
  deletedOn?: Date;
  concerns: string[];
};

export type DiaryActivityType = {
  contentId: ObjectId;
  name?: string;
  taskId?: ObjectId;
  url: string;
  thumbnail?: string;
  icon?: string;
  concern: string;
  contentType: "image" | "video";
};
