import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import criteria from "data/featureCriteria.js";
import askRepeatedly from "./askRepeatedly.js";
import filterImagesByFeature from "@/helpers/filterImagesByFeature.js";
import { SexEnum, TypeEnum, PartEnum, ToAnalyzeType, CategoryNameEnum } from "types.js";
import { FeatureAnalysisResultType } from "@/types/analyzeFeatureType.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  sex: SexEnum;
  feature: string;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  toAnalyzeObjects: ToAnalyzeType[];
  type: TypeEnum;
};

export default async function analyzeFeature({
  sex,
  feature,
  toAnalyzeObjects,
  part,
  type,
  categoryName,
  userId,
}: Props) {
  try {
    const systemContent = `Rate the ${feature} of the person on the provided images from 0 to 100 according to the following criteria: ### Criteria: ${
      criteria[sex as "male"][type as "head"][feature as "mouth"]
    }###. DO YOUR BEST AT PRODUCING A SCORE EVEN IF THE IMAGES ARE NOT CLEAR. Think step-by-step. Use only the information provided.`;

    const images = filterImagesByFeature(toAnalyzeObjects, type, feature);

    const FeatureResponseFormatType = z.object({
      score: z.number(),
      explanation: z.string(),
      suggestion: z.string(),
    });

    const runs = [
      {
        isMini: false,
        content: [
          ...images.map((image) => ({
            type: "image_url" as "image_url",
            image_url: {
              url: image,
              detail: "high" as "high",
            },
          })),
        ],
        responseFormat: zodResponseFormat(
          FeatureResponseFormatType,
          "analysis"
        ),
      },
    ];

    const { score, explanation, suggestion } = await askRepeatedly({
      systemContent,
      userId,
      runs,
      categoryName,
      functionName: "analyzeFeature",
    });

    const roundedRate = Math.round(score);

    const response: FeatureAnalysisResultType = {
      score: roundedRate,
      explanation,
      suggestion,
      feature,
      part,
      type,
    };

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
