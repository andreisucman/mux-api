import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "./askRepeatedly.js";
import { PartEnum, CategoryNameEnum, ScoreType } from "types.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { ChatCompletionContentPart } from "openai/src/resources/index.js";

type Props = {
  userId: string;
  name: string;
  part: PartEnum;
  previousScore: number;
  categoryName: CategoryNameEnum;
  currentImages: string[];
  previousImages: string[];
  previousExplanation: string;
  assessmentCriteria?: string;
};

export default async function compareFeatureProgress({
  userId,
  name,
  part,
  categoryName,
  currentImages,
  previousImages,
  previousExplanation,
  previousScore,
  assessmentCriteria,
}: Props) {
  try {
    let systemContent = `You are a dermatologist. Compare the severity of the ${name} on the current images with its state on the previous images and come up with a new severity score from 0 to 100, where 0 stands for non-existend, and 100 for the highest severty. Don't assume, base your opinion on the available information only. Don't suggest anything. Think step-by-step.`;

    if (assessmentCriteria) {
      systemContent = `You are a dermatologist. Compare the condition of the ${name} on the current and previous images according to this criteria: ${assessmentCriteria}###. Make no assumptions, base your opinion on the available information only. Don't suggest anything. Think step-by-step.`;
    }

    const scoreDecription = assessmentCriteria
      ? `Score of ${name} from 0 to 100.`
      : `Severity score of ${name} from 0 to 100.`;

    const FeatureProgressResponseFormatType = z.object({
      score: z.number().describe(scoreDecription),
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
        text: `The previous ${assessmentCriteria ? "score" : "severity score"}: ${previousScore}.`,
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
