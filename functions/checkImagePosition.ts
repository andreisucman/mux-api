import * as dotenv from "dotenv";
dotenv.config();

import { CategoryNameEnum, PartEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { imagePositionRequirements } from "@/data/imagePositionRequirements.js";
import { urlToBase64 } from "@/helpers/utils.js";
import askRepeatedly from "./askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { RunType } from "@/types/askOpenaiTypes.js";
import { z } from "zod";

type Props = {
  userId: string;
  image: string;
  position: string;
  part: PartEnum;
  categoryName: CategoryNameEnum;
};

export default async function checkImagePosition({
  userId,
  image,
  part,
  categoryName,
  position,
}: Props) {
  try {
    let requirement;

    if (position) {
      requirement = imagePositionRequirements.find(
        (obj) => obj.part === part && obj.position === position
      );
    } else {
      requirement = imagePositionRequirements.find((obj) => obj.part === part);
    }

    if (!requirement) {
      return { verdict: false, message: "Bad request" };
    }

    const systemContent = requirement.requirement;

    const CheckImagePositionResponseType = z.object({
      isPositionValid: z.boolean().describe("true if yes, false if not"),
    });

    const runs: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "image_url",
            image_url: { url: await urlToBase64(image), detail: "low" },
          },
        ],
        responseFormat: zodResponseFormat(
          CheckImagePositionResponseType,
          "CheckImagePositionResponseType"
        ),
      },
    ];

    const analysisResponse = await askRepeatedly({
      runs,
      userId,
      systemContent,
      categoryName,
      functionName: "checkImagePosition",
    });

    return {
      verdict: analysisResponse.isPositionValid,
      message: requirement.message,
    };
  } catch (err) {
    throw httpError(err);
  }
}
