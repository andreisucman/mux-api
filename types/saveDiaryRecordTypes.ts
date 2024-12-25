import { ObjectId } from "mongodb";
import { TypeEnum } from "@/types.js";
import { ModerationStatusEnum } from "@/types.js";

export type DiaryRecordType = {
  _id: ObjectId;
  type: TypeEnum;
  audio: string;
  activity: string;
  userId: ObjectId;
  transcription: string;
  createdAt: Date;
  userName: string | null;
  isPublic: boolean;
  avatar: { [key: string]: any } | null;
  moderationStatus: ModerationStatusEnum;
};
