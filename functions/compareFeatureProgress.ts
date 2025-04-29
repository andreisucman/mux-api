import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "./askRepeatedly.js";
import { CategoryNameEnum, PartEnum, ScoreType } from "types.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { ChatCompletionContentPart } from "openai/src/resources/index.js";

type Props = {
  part: PartEnum;
  userId: string;
  name: string;
  previousScore: number;
  categoryName: CategoryNameEnum;
  currentImages: string[];
  previousImages: string[];
  previousExplanation: string;
};

export default async function compareFeatureProgress({
  part,
  userId,
  name,
  categoryName,
  currentImages,
  previousImages,
  previousExplanation,
  previousScore,
}: Props) {
  try {
    let systemContent = `You are a dermatologist and fitness coach. Compare the severity of the ${name} of the person's ${part} on the current images with its state on the previous images and come up with a new severity score from 0 to 100, where 0 stands for non-existend, and 100 for the highest severty. Don't assume, base your opinion on the available information only. Don't suggest anything. Think step-by-step.`;

    const FeatureProgressResponseFormatType = z.object({
      score: z.number().describe(`Severity score of ${name} from 0 to 100.`),
      explanation: z.string().describe(`3-5 sentences of explanation for the user in 2nd tense (you/your).`),
    });

    const content: ChatCompletionContentPart[] = [{ type: "text", text: "The previous images:" }];

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
        text: `The previous severity score}: ${previousScore}.`,
      },
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
        responseFormat: zodResponseFormat(FeatureProgressResponseFormatType, "FeatureProgressResponseFormatType"),
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
