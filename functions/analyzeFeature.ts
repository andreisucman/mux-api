import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import criteria from "data/featureCriteria.js";
import askRepeatedly from "./askRepeatedly.js";
import filterImagesByFeature from "@/helpers/filterImagesByFeature.js";
import { SexEnum, PartEnum, ToAnalyzeType, CategoryNameEnum } from "types.js";
import { FeatureAnalysisResultType } from "@/types/analyzeFeatureType.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";

type Props = {
  userId: string;
  sex: SexEnum;
  feature: string;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  toAnalyze: ToAnalyzeType[];
};

export default async function analyzeFeature({
  sex,
  feature,
  toAnalyze,
  part,
  categoryName,
  userId,
}: Props) {
  try {
    const systemContent = `You are an anthropologist, dermatologist and anathomist. Rate the ${feature} of the person on the provided images from 0 to 100 according to the following criteria: ### Criteria: ${
      criteria[sex as "male"][feature as "mouth"]
    }###. Explain your reasoning with the references to the images. DO YOUR BEST AT PRODUCING A SCORE EVEN IF THE IMAGES ARE NOT CLEAR. Think step-by-step. Don't suggest any specific solutions. Don't mention the criteria in your response.`;

    const filteredToAnalyze = filterImagesByFeature(toAnalyze, feature);

    const FeatureResponseFormatType = z.object({
      score: z
        .number()
        .describe(
          `score from 0 to 100 representing the condition of the ${feature} based on the criteria`
        ),
      explanation: z
        .string()
        .describe(`3-5 sentences of your reasoning for the score.`),
    });

    const imageContent = [];

    for (const toAnalyzeObject of filteredToAnalyze) {
      imageContent.push({
        type: "image_url",
        image_url: {
          url: await urlToBase64(toAnalyzeObject.mainUrl.url),
          detail: "high",
        },
      });
    }

    const runs = [
      {
        isMini: false,
        content: imageContent,
      },
    ];

    const firstResponse = await askRepeatedly({
      runs,
      userId,
      systemContent,
      categoryName,
      functionName: "analyzeFeature",
      isResultString: true,
    });

    const formatSystemContent =
      "You are given a description of the user's body part. Your goal is to format the description in the 2nd tense (you/your) with a casual language, better flow an readability. Your response must be entirely based on the information you are given. Don't make things up. Think step-by-step.";

    const formatRuns = [
      {
        isMini: true,
        model: "ft:gpt-4o-mini-2024-07-18:personal:analyzefeature:B0pQR81v",
        content: [
          {
            type: "text" as "text",
            text: firstResponse,
          },
        ],
        responseFormat: zodResponseFormat(
          FeatureResponseFormatType,
          "analysis"
        ),
      },
    ];

    const { score, explanation } = await askRepeatedly({
      runs: formatRuns,
      userId,
      systemContent: formatSystemContent,
      categoryName,
      functionName: "analyzeFeature",
    });

    await incrementProgress({ value: 1, operationKey: "progress", userId });

    const response: FeatureAnalysisResultType = {
      score: Math.round(score),
      explanation,
      feature,
      part,
    };

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
