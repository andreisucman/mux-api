import { ObjectId } from "mongodb";
import { ModerationStatusEnum } from "@/types.js";

export type DiaryRecordType = {
  _id: ObjectId;
  audio: string;
  embedding: number[];
  activity: DiaryActivityType[];
  userId: ObjectId;
  transcription: string;
  createdAt: Date;
  userName: string | null;
  avatar: { [key: string]: any } | null;
  moderationStatus: ModerationStatusEnum;
};

export type DiaryActivityType = {
  contentId: ObjectId;
  name?: string;
  url: string;
  thumbnail?: string;
  icon?: string;
  contentType: "image" | "video";
  categoryName: "style" | "proof" | "food";
};
