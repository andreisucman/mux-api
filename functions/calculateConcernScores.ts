import doWithRetries from "@/helpers/doWithRetries.js";
import { CategoryNameEnum, PartEnum, ProgressType, UserConcernType } from "@/types.js";
import compareFeatureProgress from "./compareFeatureProgress.js";
import analyzeFeature from "./analyzeFeature.js";

type Props = {
  previousScan: ProgressType;
  concerns: UserConcernType[];
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
        concerns.map(async (concernObject: UserConcernType) => {
          const relevantPreviousRecord = previousScan.concernScore;

          return doWithRetries(() => {
            return compareFeatureProgress({
              part,
              userId,
              categoryName,
              previousImages,
              currentImages,
              name: concernObject.name,
              previousScore: relevantPreviousRecord.value,
              previousExplanation: relevantPreviousRecord.explanation,
            });
          });
        })
      )
    );
  } else {
    // first scan case
    return await doWithRetries(async () =>
      Promise.all(
        concerns.map(async (concernObject: UserConcernType) => {
          return doWithRetries(() =>
            analyzeFeature({
              part,
              userId,
              name: concernObject.name,
              categoryName,
              relevantImages: currentImages,
            })
          );
        })
      )
    );
  }
}
