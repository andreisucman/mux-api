import z from "zod";
import * as dotenv from "dotenv";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "./askRepeatedly.js";
import { PartEnum, CategoryNameEnum } from "types.js";
import { ScoreType } from "types.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { RunType } from "@/types/askOpenaiTypes.js";

dotenv.config();

type Props = {
  userId: string;
  name: string;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  assessmentCriteria?: string;
  relevantImages: string[];
};

export default async function analyzeFeature({
  name,
  assessmentCriteria,
  relevantImages,
  part,
  categoryName,
  userId,
}: Props) {
  try {
    let systemContent = `You are a dermatologist. Rate the severity of the ${name} concern on the provided images from 0 to 100, where 0 represents non-existed and 100 represents the most severe condition. Don't assume, base your opinion on the available information only. Don't suggest any solutions or seeing dermatologist. Think step-by-step.`;

    if (assessmentCriteria) {
      systemContent = `You are a dermatologist. Rate the ${name} of the person's ${part} on the provided images from 0 to 100 according to the following criteria: ### Criteria: ${assessmentCriteria}###. Don't mention the criteria in your response. Don't suggest any solutions or seeing dermatologist. Think step-by-step.`;
    }

    const scoreDecription = assessmentCriteria
      ? `Score of ${name} from 0 to 100.`
      : `Severity score of ${name} from 0 to 100.`;

    const FeatureResponseFormatType = z.object({
      score: z.number().describe(scoreDecription),
      explanation: z.string().describe(`3-5 sentences of explanation for the user in 2nd tense (you/your).`),
    });

    const imageContent = [];

    for (const imageUrl of relevantImages) {
      imageContent.push({
        type: "image_url",
        image_url: {
          url: await urlToBase64(imageUrl),
          detail: "high",
        },
      });
    }

    const content = [...imageContent];

    if (!assessmentCriteria) {
      content.push({
        type: "text",
        text: "The concern might not be present on the images at all. If so, return severity as 0.",
      });
    }
    const runs: RunType[] = [
      {
        model: "gpt-4o",
        content,
        responseFormat: zodResponseFormat(FeatureResponseFormatType, "FeatureResponseFormatType"),
      },
    ];

    const { score, explanation } = await askRepeatedly({
      runs,
      userId,
      systemContent,
      categoryName,
      functionName: "analyzeFeature",
    });

    await incrementProgress({ value: 1, operationKey: "progress", userId });

    const response: ScoreType = {
      value: Math.round(score),
      explanation,
      name,
      part,
    };

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
