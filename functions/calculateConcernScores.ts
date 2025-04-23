import doWithRetries from "@/helpers/doWithRetries.js";
import { CategoryNameEnum, PartEnum, ProgressType } from "@/types.js";
import compareFeatureProgress from "./compareFeatureProgress.js";
import analyzeFeature from "./analyzeFeature.js";

type Props = {
  previousScan: ProgressType;
  concerns: string[];
  part: PartEnum;
  userId: string;
  categoryName: CategoryNameEnum;
  currentImages: string[];
};

export default async function calculateConcernScores({
  previousScan,
  part,
  userId,
  categoryName,
  currentImages,
  concerns,
}: Props) {
  if (previousScan) {
    const previousImages = previousScan.images.map((obj) => obj.mainUrl.url);

    return await doWithRetries(async () =>
      Promise.all(
        concerns.map(async (concern: string) => {
          const relevantPreviouConcernObject = previousScan.concernScores.find((co) => co.name === concern);
          if (relevantPreviouConcernObject) {
            return doWithRetries(() =>
              compareFeatureProgress({
                part,
                userId,
                categoryName,
                previousImages,
                currentImages,
                name: concern,
                previousScore: relevantPreviouConcernObject.value,
                previousExplanation: relevantPreviouConcernObject.explanation,
              })
            );
          } else {
            return doWithRetries(() =>
              analyzeFeature({
                part,
                userId,
                name: concern,
                categoryName,
                relevantImages: currentImages,
              })
            );
          }
        })
      )
    );
  } else {
    // first scan case
    return await doWithRetries(async () =>
      Promise.all(
        concerns.map(async (concern: string) => {
          return doWithRetries(() =>
            analyzeFeature({
              part,
              userId,
              name: concern,
              categoryName,
              relevantImages: currentImages,
            })
          );
        })
      )
    );
  }
}
