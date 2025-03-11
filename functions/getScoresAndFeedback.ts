import doWithRetries from "@/helpers/doWithRetries.js";
import getFeaturesToAnalyze from "@/helpers/getFeaturesToAnalyze.js";
import { db } from "@/init.js";
import {
  CategoryNameEnum,
  FeatureAnalysisType,
  FormattedRatingType,
  ProgressImageType,
  UserConcernType,
  PartEnum,
  SexEnum,
} from "@/types.js";
import { FeatureAnalysisResultType } from "@/types/analyzeFeatureType.js";
import { ObjectId } from "mongodb";
import analyzeFeature from "./analyzeFeature.js";
import compareFeatureProgress from "./compareFeatureProgress.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import analyzeConcerns from "./analyzeConcerns.js";
import formatRatings from "@/helpers/formatRatings.js";
import filterImagesByFeature from "@/helpers/filterImagesByFeature.js";
import { maintenanceConcerns } from "@/data/maintenanceConcerns.js";

export type ImageObject = {
  position: string;
  part: string;
  url: string;
};

type Props = {
  part: PartEnum;
  userId: string;
  sex: SexEnum;
  progressIdToExclude?: ObjectId;
  initialScores?: FormattedRatingType;
  categoryName: CategoryNameEnum;
  imageObjects: ImageObject[];
  currentPartConcerns: UserConcernType[];
};

export default async function getScoresAndFeedback({
  part,
  sex,
  userId,
  initialScores,
  categoryName,
  imageObjects,
  progressIdToExclude,
  currentPartConcerns,
}: Props) {
  let scores: FormattedRatingType = { overall: 0 };
  let scoresDifference: FormattedRatingType = { overall: 0 };
  let concerns: UserConcernType[] = [];

  const featuresToAnalyze = getFeaturesToAnalyze({
    sex,
    part,
  });

  let appearanceAnalysisResults: FeatureAnalysisResultType[] = [];

  const previousScanFilter: { [key: string]: any } = {
    userId: new ObjectId(userId),
    part,
  };

  if (previousScanFilter) previousScanFilter._id = { $ne: progressIdToExclude };

  const previousScan = await doWithRetries(
    async () =>
      db
        .collection("Progress")
        .find(previousScanFilter, { projection: { images: 1, scores: 1 } })
        .sort({ createdAt: -1 })
        .next() as unknown as {
        images: ProgressImageType[];
        scores: FormattedRatingType;
      }
  );

  if (!previousScan) {
    // first scan case
    appearanceAnalysisResults = await doWithRetries(async () =>
      Promise.all(
        featuresToAnalyze.map(async (feature: string) => {
          const filteredToAnalyze = filterImagesByFeature(
            imageObjects,
            feature
          );
          return doWithRetries(() =>
            analyzeFeature({
              part,
              userId,
              feature,
              categoryName,
              sex,
              relevantImages: filteredToAnalyze.map((obj) => obj.url),
            })
          );
        })
      )
    );
  } else {
    const previousImages = previousScan.images.map((obj) => obj.mainUrl.url);

    const allPreviousExplanations = previousScan.scores.explanations;

    appearanceAnalysisResults = await doWithRetries(async () =>
      Promise.all(
        featuresToAnalyze.map(async (feature: string) => {
          const relevantPreviousExplanation = allPreviousExplanations.find(
            (obj) => obj.feature === feature
          );

          return doWithRetries(() => {
            const filteredToAnalyze = filterImagesByFeature(
              imageObjects,
              feature
            );
            return compareFeatureProgress({
              part,
              userId,
              feature,
              categoryName,
              sex,
              currentImages: filteredToAnalyze.map((obj) => obj.url),
              previousImages,
              previousExplanation: relevantPreviousExplanation.explanation,
            });
          });
        })
      )
    );
  }

  await incrementProgress({ value: 4, operationKey: "progress", userId });

  const newConcerns = await analyzeConcerns({
    part,
    userId,
    categoryName,
    sex,
    appearanceAnalysisResults,
    currentImages: imageObjects.map((obj) => obj.url),
  });

  if (newConcerns && newConcerns.length > 0) {
    const uniqueConcerns = [...currentPartConcerns, ...newConcerns].filter(
      (obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i
    );

    concerns = uniqueConcerns;
  } else {
    concerns = maintenanceConcerns.filter((c) => c.part === part);
  }

  /* add the record of progress to the Progress collection*/
  scores = formatRatings(appearanceAnalysisResults);

  scores.explanations = appearanceAnalysisResults.map(
    ({ feature, explanation }: FeatureAnalysisType) => ({
      feature,
      explanation,
    })
  );
  const safeInitialScores = initialScores || scores;

  scoresDifference = Object.keys(safeInitialScores).reduce(
    (a: { [key: string]: number }, key) => {
      if (typeof scores[key] === "number") {
        a[key] = scores[key] - safeInitialScores[key];
      }
      return a;
    },
    {}
  );

  return { scores, scoresDifference, concerns };
}
