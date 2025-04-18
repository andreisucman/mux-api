import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import {
  BeforeAfterType,
  DemographicsType,
  ModerationStatusEnum,
  PartEnum,
  ProgressImageType,
  ProgressType,
  ScoreDifferenceType,
  ScoreType,
} from "@/types.js";
import { ObjectId } from "mongodb";

type Props = {
  userName: string;
  userId: ObjectId;
  part: PartEnum;
  demographics: DemographicsType;
  concernScore: ScoreType;
  concernScoreDifference: ScoreDifferenceType;
  initialDate: Date;
  createdAt: Date;
  images: ProgressImageType[];
  initialImages: ProgressImageType[];
  concern: string;
  specialConsiderations: string;
  isPublic: boolean;
};

export default async function createProgressRecords({
  userName,
  userId,
  part,
  demographics,
  concernScore,
  concernScoreDifference,
  initialDate,
  createdAt,
  images,
  initialImages,
  concern,
  specialConsiderations,
  isPublic,
}: Props) {
  const recordOfProgress: ProgressType = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    part,
    demographics,
    images,
    initialImages,
    initialDate,
    createdAt,
    userName,
    concern,
    concernScore,
    concernScoreDifference,
    specialConsiderations,
    isPublic,
    moderationStatus: ModerationStatusEnum.ACTIVE,
  };

  const beforeAfterUpdate: Partial<BeforeAfterType> = {
    images,
    concernScore,
    concernScoreDifference,
    updatedAt: new Date(),
  };

  const baResponse = await doWithRetries(async () =>
    db.collection("BeforeAfter").updateOne({ userId: new ObjectId(userId), concern, part }, { $set: beforeAfterUpdate })
  );

  const progressResponse = await doWithRetries(async () => db.collection("Progress").insertOne(recordOfProgress));

  return { progressId: progressResponse.insertedId, baId: baResponse.upsertedId };
}
