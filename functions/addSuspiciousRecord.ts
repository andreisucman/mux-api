import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ModerationResultType } from "./moderateContent.js";
import { adminDb } from "init.js";
import { ModerationStatusEnum } from "@/types.js";

type Props = {
  userId: string;
  collection:
    | "Progress"
    | "StyleAnalysis"
    | "Proof"
    | "About"
    | "Diary"
    | "User";
  contentId: string;
  key?: string;
  moderationResult: ModerationResultType[];
};

export default async function addSuspiciousRecord({
  collection,
  contentId,
  userId,
  key,
  moderationResult,
}: Props) {
  try {
    await doWithRetries(async () =>
      adminDb.collection("SuspiciousRecord").insertOne({
        userId: new ObjectId(userId),
        contentId: new ObjectId(contentId),
        collection,
        moderationResult,
        moderationStatus: ModerationStatusEnum.ACTIVE,
        createdAt: new Date(),
        key,
      })
    );
  } catch (err) {
    throw httpError(err);
  }
}
