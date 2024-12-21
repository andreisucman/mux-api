import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ModerationResultType } from "./moderateContent.js";
import { adminDb } from "init.js";

type Props = {
  userId: string;
  collection:
    | "Progress"
    | "StyleAnalysis"
    | "Proof"
    | "About"
    | "Diary"
    | "Task"
    | "User";
  recordId: string;
  key?: string;
  moderationResult: ModerationResultType[];
};

export default async function addSuspiciousRecord({
  collection,
  recordId,
  userId,
  moderationResult,
}: Props) {
  try {
    await doWithRetries(async () =>
      adminDb.collection("SuspiciousRecord").insertOne({
        userId: new ObjectId(userId),
        recordId: new ObjectId(recordId),
        collection,
        moderationResult,
        createdAt: new Date(),
      })
    );
  } catch (err) {
    throw httpError(err);
  }
}
