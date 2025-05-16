import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { BeforeAfterType, PartEnum, ProgressType } from "@/types.js";
import { ObjectId } from "mongodb";

type PublishBeforeAfterProps = {
  userId: string;
  userName: string;
  concern: string;
  part: PartEnum;
  isPublic: boolean;
  avatar: { [key: string]: any };
};

const publishBeforeAfter = async ({
  userId,
  concern,
  isPublic,
  part,
  avatar,
  userName,
}: PublishBeforeAfterProps) => {
  const earliestProgressRecord = (await doWithRetries(() =>
    db
      .collection("Progress")
      .aggregate([
        {
          $match: {
            userId: new ObjectId(userId),
            concerns: { $in: [concern] },
            part,
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 1 },
      ])
      .next()
  )) as unknown as ProgressType | null;

  if (earliestProgressRecord) {
    const latestProgressRecord = (await doWithRetries(() =>
      db
        .collection("Progress")
        .find({
          userId: new ObjectId(userId),
          concerns: { $in: [concern] },
          part,
        })
        .sort({ _id: -1 })
        .next()
    )) as unknown as ProgressType | null;

    if (latestProgressRecord) {
      const relevantLatestConcernScore =
        latestProgressRecord.concernScores.find((co) => co.name === concern);
      const relevantLatestConcernScoreDifference =
        latestProgressRecord.concernScoresDifference.find(
          (co) => co.name === concern
        );

      const newBARecord: BeforeAfterType = {
        userId: new ObjectId(userId),
        concern,
        part,
        images: latestProgressRecord.images,
        demographics: latestProgressRecord.demographics,
        isPublic,
        avatar,
        userName,
        concernScore: relevantLatestConcernScore,
        concernScoreDifference: relevantLatestConcernScoreDifference,
        updatedAt: latestProgressRecord.createdAt,
        initialDate: earliestProgressRecord.createdAt,
        initialImages: earliestProgressRecord.images,
      };

      await doWithRetries(async () =>
        db.collection("BeforeAfter").insertOne(newBARecord)
      );
    }
  }
};

export default publishBeforeAfter;
