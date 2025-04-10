import * as dotenv from "dotenv";
dotenv.config();

import { CategoryNameEnum, PartEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import askRepeatedly from "./askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { RunType } from "@/types/askOpenaiTypes.js";
import { z } from "zod";

type Props = {
  userId: string;
  part: PartEnum;
  beforeImage: string;
  afterImage: string;
  categoryName: CategoryNameEnum;
};

export default async function checkAngleAndPositioningOfImages({
  part,
  userId,
  beforeImage,
  afterImage,
  categoryName,
}: Props) {
  try {
    const systemContent = `You are given two images, before and after of ${part}. Is the second image valid for the before-after comparison with the first image? The capture of ${part} on the second image should be similar to the first in terms of angle. Don't be too strict, if most matches return yes.`;

    const CheckImagePositionResponseType = z.object({
      isValidForComparison: z.boolean().describe("true if yes, false if not"),
      explanation: z
        .string()
        .describe(
          "If false, describe in 1-sentence in 2nd tense (you/your) how the user should take the image do to make it match. If true, return empty string."
        ),
    });

    const runs: RunType[] = [
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "image_url",
            image_url: { url: await urlToBase64(beforeImage), detail: "low" },
          },
          {
            type: "image_url",
            image_url: { url: await urlToBase64(afterImage), detail: "low" },
          },
        ],
        responseFormat: zodResponseFormat(CheckImagePositionResponseType, "CheckImagePositionResponseType"),
      },
    ];

    const response = await askRepeatedly({
      runs,
      userId,
      systemContent,
      categoryName,
      functionName: "checkImageRequirements",
    });

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
