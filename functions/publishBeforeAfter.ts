import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";
import { BeforeAfterType, PartEnum } from "@/types.js";
import { ObjectId } from "mongodb";

type PublishBeforeAfterProps = {
  firstRoutineStartDate: Date;
  userId: string;
  userName: string;
  concern: string;
  part: PartEnum;
  routineName: string;
  avatar: { [key: string]: any };
};

const publishBeforeAfter = async ({
  firstRoutineStartDate,
  userId,
  concern,
  part,
  avatar,
  userName,
  routineName,
}: PublishBeforeAfterProps) => {
  const closestProgressBeforeTheRoutine = await doWithRetries(() =>
    db
      .collection("Progress")
      .aggregate([
        {
          $match: {
            userId: new ObjectId(userId),
            concern,
            part,
            createdAt: { $lte: new Date(firstRoutineStartDate) },
          },
        },
        { $addFields: { diff: { $abs: { $subtract: ["$createdAt", new Date(firstRoutineStartDate)] } } } },
        { $sort: { diff: 1 } },
        { $limit: 1 },
        { $unset: "diff" },
      ])
      .next()
  );

  if (!closestProgressBeforeTheRoutine) throw httpError("Publishing routine without before progress record");

  const latestProgressRecord = await doWithRetries(() =>
    db
      .collection("Progress")
      .find({ userId: new ObjectId(userId), concern, part })
      .sort({ createdAt: -1 })
      .next()
  );

  if (!latestProgressRecord) throw httpError("Publishing routine without after progress record");

  const newBARecord: BeforeAfterType = {
    userId: new ObjectId(userId),
    concern,
    part,
    images: latestProgressRecord.images,
    demographics: latestProgressRecord.demographics,
    isPublic: true,
    avatar,
    userName,
    concernScore: latestProgressRecord.concernScore,
    concernScoreDifference: latestProgressRecord.concernScoreDifference,
    updatedAt: latestProgressRecord.createdAt,
    initialDate: closestProgressBeforeTheRoutine.createdAt,
    initialImages: closestProgressBeforeTheRoutine.images,
    routineName,
  };

  await doWithRetries(async () => db.collection("BeforeAfter").insertOne(newBARecord));
};

export default publishBeforeAfter;
