import describeFeatureCondition from "@/functions/describeFeatureCondition.js";
import doWithRetries from "helpers/doWithRetries.js";
import filterImagesByFeature from "@/helpers/filterImagesByFeature.js";
import formatRatings from "@/helpers/formatRatings.js";
import {
  SexEnum,
  ToAnalyzeType,
  FormattedRatingType,
  CategoryNameEnum,
} from "types.js";
import { FeatureAnalysisType } from "types.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  sex: SexEnum;
  ageInterval: string;
  analysisResults: FeatureAnalysisType[];
  toAnalyze: ToAnalyzeType[];
  listOfFeatures: string[];
  categoryName: CategoryNameEnum;
};

export default async function analyzePotential({
  userId,
  sex,
  categoryName,
  analysisResults,
  ageInterval,
  toAnalyze,
  listOfFeatures,
}: Props) {
  try {
    const results = await doWithRetries(async () =>
      Promise.all(
        listOfFeatures.map((feature) => {
          const currentScore = analysisResults.find(
            (record) => record.feature === feature
          ).score;

          const filteredImages = filterImagesByFeature(
            toAnalyze,
            feature
          );

          return doWithRetries(async () =>
            describeFeatureCondition({
              userId,
              sex,
              feature,
              currentScore,
              ageInterval,
              categoryName,
              images: filteredImages,
            })
          );
        })
      )
    );

    const rating: FormattedRatingType = formatRatings(results);

    rating.explanations = results.map((record: FeatureAnalysisType) => ({
      feature: record.feature,
      explanation: record.explanation,
    }));

    return rating;
  } catch (err) {
    throw httpError(err);
  }
}
