import { ObjectId } from "mongodb";
import { ModerationStatusEnum, PartEnum } from "@/types.js";

export type DiaryType = {
  _id: ObjectId;
  part: PartEnum;
  concern: string;
  audio: { createdAt: Date; url: string }[];
  activity: DiaryActivityType[];
  userId: ObjectId;
  transcriptions: { createdAt: Date; text: string }[];
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
  concern: string;
  contentType: "image" | "video";
};
