import doWithRetries from "@/helpers/doWithRetries.js";
import { CategoryNameEnum, PartEnum, ProgressType } from "@/types.js";
import compareFeatureProgress from "./compareFeatureProgress.js";
import analyzeFeature from "./analyzeFeature.js";
import criteria from "@/data/featureCriteria.js";

type Props = {
  previousScan: ProgressType;
  part: PartEnum;
  userId: string;
  categoryName: CategoryNameEnum;
  currentImages: string[];
};

export default async function calculateFeatureScores({
  previousScan,
  part,
  userId,
  categoryName,
  currentImages,
}: Props) {
  const features = Object.keys(criteria[part]);

  if (previousScan) {
    const previousImages = previousScan.images.map((obj) => obj.mainUrl.url);

    return await doWithRetries(async () =>
      Promise.all(
        features.map(async (feature: string) => {
          const relevantPreviousRecord = previousScan.featureScores.find((obj) => obj.name === feature);
          const assessmentCriteria = criteria[part][feature];

          return doWithRetries(() => {
            return compareFeatureProgress({
              part,
              userId,
              categoryName,
              previousImages,
              currentImages,
              name: feature,
              previousScore: relevantPreviousRecord.value,
              previousExplanation: relevantPreviousRecord.explanation,
              assessmentCriteria,
            });
          });
        })
      )
    );
  } else {
    // first scan case
    return await doWithRetries(async () =>
      Promise.all(
        features.map(async (feature: string) => {
          const assessmentCriteria = criteria[part][feature];

          return doWithRetries(() =>
            analyzeFeature({
              part,
              userId,
              categoryName,
              name: feature,
              relevantImages: currentImages,
              assessmentCriteria,
            })
          );
        })
      )
    );
  }
}
