import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ModerationResultType } from "./moderateContent.js";
import { adminDb } from "init.js";
import getTheMostSuspiciousResult from "@/helpers/getTheMostSuspiciousResult.js";
import { ModerationStatusEnum } from "@/types.js";

export enum SuspiciousRecordCollectionEnum {
  PROGRESS = "Progress",
  PROOF = "Proof",
  DIARY = "Diary",
  USER = "User",
  ROUTINE_DATA = "RoutineData",
}

type Props = {
  userId: string;
  collection: SuspiciousRecordCollectionEnum;
  contentId: string;
  key?: string;
  moderationResults: ModerationResultType[];
};

export default async function addSuspiciousRecord({ collection, contentId, userId, key, moderationResults }: Props) {
  try {
    const theMostSuspiciousResult = getTheMostSuspiciousResult(moderationResults);

    await doWithRetries(async () =>
      adminDb.collection("SuspiciousRecord").insertOne({
        userId: new ObjectId(userId),
        contentId: new ObjectId(contentId),
        moderationResults: [theMostSuspiciousResult],
        moderationStatus: ModerationStatusEnum.ACTIVE,
        createdAt: new Date(),
        collection,
        key,
      })
    );
  } catch (err) {
    throw httpError(err);
  }
}
