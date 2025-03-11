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

export default async function checkImageRequirements({
  userId,
  image,
  part,
  categoryName,
  position,
}: Props) {
  try {
    let positionRequirement;

    if (position) {
      positionRequirement = imagePositionRequirements.find(
        (obj) => obj.part === part && obj.position === position
      );
    } else {
      positionRequirement = imagePositionRequirements.find(
        (obj) => obj.part === part
      );
    }

    if (!positionRequirement) {
      return {
        isPositionValid: false,
        isClearlyVisible: false,
        numberOfPeople: 0,
        message: "Bad request",
      };
    }

    const systemContent = `1.${positionRequirement.requirement}? 2. Is the human on the image clearly visible with no shadows or glitter obscuring their features? 3. How many people are on the image?`;

    const CheckImagePositionResponseType = z.object({
      isPositionValid: z
        .boolean()
        .describe(`true if ${positionRequirement.requirement}, false if not`),
      isClearlyVisible: z
        .boolean()
        .describe("true if clearly visible, false if not"),
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
        responseFormat: zodResponseFormat(
          CheckImagePositionResponseType,
          "CheckImagePositionResponseType"
        ),
      },
    ];

    const { isPositionValid, isClearlyVisible, numberOfPeople } =
      await askRepeatedly({
        runs,
        userId,
        systemContent,
        categoryName,
        functionName: "checkImageRequirements",
      });

    return {
      isPositionValid,
      isClearlyVisible,
      numberOfPeople,
      message: positionRequirement.message,
    };
  } catch (err) {
    throw httpError(err);
  }
}
