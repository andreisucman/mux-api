import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { CategoryNameEnum, UserConcernType, PartEnum, ProgressType } from "@/types.js";
import { ObjectId } from "mongodb";
import incrementProgress from "@/helpers/incrementProgress.js";
import analyzeConcerns from "./analyzeConcerns.js";
import { maintenanceConcerns } from "@/data/maintenanceConcerns.js";
import { calculateScoreDifferences, daysFrom } from "@/helpers/utils.js";
import { ScoreType } from "@/types.js";
import calculateConcernScores from "./calculateConcernScores.js";
import calculateFeatureScores from "./calculateFeatureScores.js";

export type ImageObject = {
  part: string;
  url: string;
};

type Props = {
  part: PartEnum;
  userId: string;
  progressIdToExclude?: ObjectId;
  initialConcernScores?: ScoreType[];
  initialFeatureScores?: ScoreType[];
  categoryName: CategoryNameEnum;
  imageObjects: ImageObject[];
  currentPartConcerns: UserConcernType[];
  partUserUploadedConcerns: Partial<UserConcernType>[];
};

export default async function getScoresAndFeedback({
  part,
  userId,
  initialConcernScores,
  initialFeatureScores,
  categoryName,
  imageObjects,
  progressIdToExclude,
  currentPartConcerns,
  partUserUploadedConcerns,
}: Props) {
  const updatedPartUserUploadedConcerns: UserConcernType[] = partUserUploadedConcerns.map((obj, i) => ({
    name: obj.name,
    part: obj.part,
    isDisabled: false,
    importance: i + 1,
  }));

  let concerns: UserConcernType[] = [...updatedPartUserUploadedConcerns, ...currentPartConcerns].map((obj, i) => ({
    ...obj,
    importance: i + 1,
  }));

  const minimumDistance = daysFrom({ days: -7 });

  const previousScanFilter: { [key: string]: any } = {
    userId: new ObjectId(userId),
    $or: [{ concernScores: { $exists: true }, featureScores: { $exists: true } }],
    createdAt: { $lte: minimumDistance },
    part,
  };

  if (progressIdToExclude) previousScanFilter._id = { $ne: progressIdToExclude };

  const previousScan = await doWithRetries(
    async () =>
      db
        .collection("Progress")
        .find(previousScanFilter, { projection: { images: 1, concernScores: 1, featureScores: 1 } })
        .sort({ createdAt: -1 })
        .next() as unknown as ProgressType
  );

  const newConcerns = await analyzeConcerns({
    part,
    userId,
    categoryName,
    currentImages: imageObjects.map((obj) => obj.url),
  });

  const updatedConcerns = [...concerns, ...newConcerns];

  if (updatedConcerns.length > 0) {
    const uniqueConcerns = updatedConcerns.filter((obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i);
    concerns = uniqueConcerns;
  } else {
    concerns = maintenanceConcerns.filter((c) => c.part === part);
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

  const safeInitialConcernScores = initialConcernScores || concernScores;

  const concernScoresDifference = calculateScoreDifferences(safeInitialConcernScores, concernScores);

  const featureScores = await calculateFeatureScores({
    categoryName,
    currentImages: imageObjects.map((imo) => imo.url),
    part,
    previousScan,
    userId,
  });

  const safeInitialFeatureScores = initialFeatureScores || featureScores;

  const featureScoresDifference = calculateScoreDifferences(safeInitialFeatureScores, featureScores);

  const concernsThatAreTrulyPresent = concerns.filter((co) =>
    concernScores.find((so) => so.part === co.part && so.value >= 10)
  );

  if (concernsThatAreTrulyPresent.length === 0) {
    concernsThatAreTrulyPresent.push(...maintenanceConcerns.filter((c) => c.part === part));
  }

  return {
    concernScores,
    concernScoresDifference,
    featureScores,
    featureScoresDifference,
    concerns: concernsThatAreTrulyPresent,
  };
}
