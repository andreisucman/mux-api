import * as dotenv from "dotenv";
dotenv.config();

import { CategoryNameEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import askRepeatedly from "./askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { RunType } from "@/types/askOpenaiTypes.js";
import { z } from "zod";

type Props = {
  userId: string;
  image: string;
  categoryName: CategoryNameEnum;
};

export default async function checkImageRequirements({ userId, image, categoryName }: Props) {
  try {
    const systemContent = `1. Does the person on the image appear to be a minor (younger than 18 years)? 2. Is the subject clearly visible with no shadows or glitter obscuring their features? 3. How many people are on the image?`;

    const CheckImagePositionResponseType = z.object({
      isMinor: z.boolean().describe("true if appears to be a minor, false if not"),
      isClearlyVisible: z.boolean().describe("true if clearly visible, false if not"),
      numberOfPeople: z.number().describe("the number of people on the image"),
    });

    const runs: RunType[] = [
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "image_url",
            image_url: { url: await urlToBase64(image), detail: "low" },
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
