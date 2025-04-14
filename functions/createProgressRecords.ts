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
  avatar: { [key: string]: any };
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
  routineName?: string;
};

export default async function createProgressRecords({
  userName,
  avatar,
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
  routineName = "",
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

  const beforeAfterUpdate: BeforeAfterType = {
    images,
    part,
    demographics,
    isPublic,
    avatar,
    userName,
    concern,
    concernScore,
    concernScoreDifference,
    updatedAt: new Date(),
    initialDate,
    initialImages,
    routineName,
  };

  const updateOperation: any = {
    $set: beforeAfterUpdate,
  };

  const progressResponse = await doWithRetries(async () => db.collection("Progress").insertOne(recordOfProgress));

  const baResponse = await doWithRetries(async () =>
    db.collection("BeforeAfter").updateOne({ userId: new ObjectId(userId), concern }, updateOperation, {
      upsert: true,
    })
  );

  return { progressId: progressResponse.insertedId, baId: baResponse.upsertedId };
}
