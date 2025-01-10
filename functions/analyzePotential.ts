import rateFeaturePotential from "functions/rateFeaturePotential.js";
import doWithRetries from "helpers/doWithRetries.js";
import filterImagesByFeature from "@/helpers/filterImagesByFeature.js";
import formatRatings from "@/helpers/formatRatings.js";
import {
  SexEnum,
  TypeEnum,
  ToAnalyzeType,
  FormattedRatingType,
  CategoryNameEnum,
} from "types.js";
import { FeatureAnalysisType } from "@/types/analyzePotentialTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  sex: SexEnum;
  type: TypeEnum;
  ageInterval: string;
  analysisResults: FeatureAnalysisType[];
  toAnalyzeObjects: ToAnalyzeType[];
  listOfFeatures: string[];
  categoryName: CategoryNameEnum;
};

export default async function analyzePotential({
  userId,
  sex,
  type,
  categoryName,
  analysisResults,
  ageInterval,
  toAnalyzeObjects,
  listOfFeatures,
}: Props) {
  try {
    const results = await doWithRetries(async () =>
      Promise.all(
        listOfFeatures.map((feature) => {
          const currentScore = analysisResults.find(
            (record) => record.type === type && record.feature === feature
          ).score;

          const filteredImages = filterImagesByFeature(
            toAnalyzeObjects,
            type,
            feature
          );

          return doWithRetries(async () =>
            rateFeaturePotential({
              userId,
              sex,
              type,
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
    throw httpError(err.message, err.status);
  }
}
