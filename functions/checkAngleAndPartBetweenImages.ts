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
    const systemContent = `You are given two images of ${part}, before and after. Is the direction, light and position of the person on the image similar between the two? Don't be precise, your goal is to ensure the images are relatively comparable, i.e. - to detect entirely different captures.`;

    const CheckImagePositionResponseType = z.object({
      isValidForComparison: z.boolean().describe("true if yes, false if not"),
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
        responseFormat: zodResponseFormat(
          CheckImagePositionResponseType,
          "CheckImagePositionResponseType"
        ),
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
