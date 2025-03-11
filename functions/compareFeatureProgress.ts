import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "./askRepeatedly.js";
import criteria from "data/featureCriteria.js";
import { PartEnum, CategoryNameEnum, SexEnum } from "types.js";
import { FeatureAnalysisResultType } from "@/types/analyzeFeatureType.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { ChatCompletionContentPart } from "openai/src/resources/index.js";

type Props = {
  userId: string;
  feature: string;
  sex: SexEnum;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  currentImages: string[];
  previousImages: string[];
  previousExplanation: string;
};

export default async function compareFeatureProgress({
  userId,
  feature,
  categoryName,
  currentImages,
  previousImages,
  previousExplanation,
  part,
  sex,
}: Props) {
  try {
    const systemContent = `You are an anthropologist, dermatologist and anathomist. You are given 2 sets of images of ${feature}: the current and previous (last week's). Your goal is to compare the condition of the ${feature} now with its condition last week. Use this criteria when deciding on the current score: ### Criteria: ${
      criteria[sex as "male"][feature as "mouth"]
    }###. Make no assumptions, base your opinion on the available information only. Think step-by-step.`;

    const FeatureProgressResponseFormatType = z.object({
      score: z
        .number()
        .describe(
          `A score from 0 to 100 representing the current condition of the ${feature} based on the criteria.`
        ),
      explanation: z
        .string()
        .describe(
          `3-5 sentences explanation in the 2nd tense (you/your) describing the difference between the current and previous conditions of the ${feature}.`
        ),
    });

    const content: ChatCompletionContentPart[] = [
      { type: "text", text: "The previous images:" },
    ];

    for (const previousImage of previousImages) {
      content.push({
        type: "image_url",
        image_url: {
          url: await urlToBase64(previousImage),
          detail: "high",
        },
      });
    }

    content.push(
      {
        type: "text",
        text: `The previous explanation: ${previousExplanation}.`,
      },
      {
        type: "text",
        text: `The current images:`,
      }
    );

    for (const image of currentImages) {
      content.push({
        type: "image_url",
        image_url: {
          url: await urlToBase64(image),
          detail: "high",
        },
      });
    }

    const runs: RunType[] = [
      {
        model: "gpt-4o",
        content,
        responseFormat: zodResponseFormat(
          FeatureProgressResponseFormatType,
          "analysis"
        ),
      },
    ];

    const { score, explanation } = await askRepeatedly({
      runs,
      userId,
      systemContent,
      categoryName,
      functionName: "compareFeatureProgress",
    });

    await incrementProgress({ value: 3, operationKey: "progress", userId });

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
