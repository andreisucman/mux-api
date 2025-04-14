import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { CategoryNameEnum, UserConcernType, PartEnum, ProgressType } from "@/types.js";
import { ObjectId } from "mongodb";
import incrementProgress from "@/helpers/incrementProgress.js";
import analyzeConcerns from "./analyzeConcerns.js";
import { calculateScoreDifferences, daysFrom } from "@/helpers/utils.js";
import { ScoreType } from "@/types.js";
import calculateConcernScores from "./calculateConcernScores.js";

export type ImageObject = {
  part: string;
  url: string;
};

type Props = {
  part: PartEnum;
  userId: string;
  progressIdToExclude?: ObjectId;
  initialConcernScores?: ScoreType[];
  categoryName: CategoryNameEnum;
  imageObjects: ImageObject[];
  partUserUploadedConcerns: UserConcernType[];
};

export default async function getScoresAndFeedback({
  part,
  userId,
  initialConcernScores,
  categoryName,
  imageObjects,
  progressIdToExclude,
  partUserUploadedConcerns,
}: Props) {
  let concerns: UserConcernType[] = [...partUserUploadedConcerns];

  const minimumDistance = daysFrom({ days: -7 });

  const previousScanFilter: { [key: string]: any } = {
    userId: new ObjectId(userId),
    concernScores: { $exists: true },
    createdAt: { $lte: minimumDistance },
    part,
  };

  if (progressIdToExclude) previousScanFilter._id = { $ne: progressIdToExclude };

  const previousScan = await doWithRetries(
    async () =>
      db
        .collection("Progress")
        .find(previousScanFilter, { projection: { images: 1, concernScores: 1 } })
        .sort({ createdAt: -1 })
        .next() as unknown as ProgressType
  );

  const newConcerns = await analyzeConcerns({
    part,
    userId,
    categoryName,
    currentImages: imageObjects.map((obj) => obj.url),
  });

  const newConcernNames = newConcerns.map((o) => o.name);
  const uploadedConcernsExist = concerns.some((obj) => newConcernNames.includes(obj.name));

  if (!uploadedConcernsExist) {
    if (newConcerns.length > 0) {
      concerns = [...concerns, ...newConcerns];
    }
  }

  const concernScores = await calculateConcernScores({
    categoryName,
    concerns,
    currentImages: imageObjects.map((imo) => imo.url),
    part,
    previousScan,
    userId,
  });

  await incrementProgress({ value: 4, operationKey: "progress", userId });

  const safeInitialConcernScores = initialConcernScores.length > 0 ? initialConcernScores : concernScores;
  const concernScoresDifference = calculateScoreDifferences(safeInitialConcernScores, concernScores);

  const concernsThatAreTrulyPresent = concerns.filter((co) =>
    concernScores.find((so) => so.part === co.part && so.name === co.name && so.value >= 10)
  );

  return {
    concernScores,
    concernScoresDifference,
    concerns: concernsThatAreTrulyPresent,
  };
}
