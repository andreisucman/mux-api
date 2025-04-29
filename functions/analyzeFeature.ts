import z from "zod";
import * as dotenv from "dotenv";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "./askRepeatedly.js";
import { CategoryNameEnum, PartEnum } from "types.js";
import { ScoreType } from "types.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { RunType } from "@/types/askOpenaiTypes.js";

dotenv.config();

type Props = {
  part: PartEnum;
  userId: string;
  name: string;
  categoryName: CategoryNameEnum;
  relevantImages: string[];
};

export default async function analyzeFeature({ name, part, relevantImages, categoryName, userId }: Props) {
  try {
    let systemContent = `You are a dermatologist and fitness coach. Rate the severity of the ${name} concern of the user's ${part} on the provided images from 0 to 100, where 0 represents non-existed and 100 represents the most severe condition. Don't assume, base your opinion on the available information only. Don't suggest any solutions or seeing dermatologist. Think step-by-step.`;

    const FeatureResponseFormatType = z.object({
      score: z.number().describe(`Severity score of ${name} from 0 to 100.`),
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
    };

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
