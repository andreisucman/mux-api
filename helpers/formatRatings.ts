import { FeatureAnalysisType } from "@/types/analyzePotentialTypes.js";
import { FormattedRatingType } from "@/types.js";

export default function formatRatings(recordsArray: FeatureAnalysisType[]) {
  try {
    const totalPoints = recordsArray
      .map((r) => (isNaN(Number(r.score)) ? 0 : Number(r.score)))
      .reduce((a, b) => a + b, 0);

    const overall = Math.floor(totalPoints / recordsArray.length);

    const scores: FormattedRatingType = { overall };

    for (const record of recordsArray) {
      scores[record.feature] = record.score;
    }

    return scores;
  } catch (err) {
    console.log("Error in formatRatings");
    throw err;
  }
}
