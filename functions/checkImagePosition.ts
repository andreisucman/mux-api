import * as dotenv from "dotenv";
dotenv.config();

import { CategoryNameEnum, PartEnum } from "@/types.js";
import askTogether from "./askTogether.js";
import httpError from "@/helpers/httpError.js";
import { imagePositionRequirements } from "@/data/imagePositionRequirements.js";
import { cleanString } from "@/helpers/utils.js";

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

    const messages = [
      {
        role: "system",
        content: `${requirement?.requirement}. SAY ONLY YES OR NO.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: image,
            },
          },
        ],
      },
      {
        role: "system",
        content: `ANSWER WITH A "YES" OR "NO" AND NOTHING ELSE.`,
      },
    ];

    const verdict = await askTogether({
      messages,
      userId,
      categoryName,
      model: process.env.LLAMA_11B_VISION,
      functionName: "checkImagePosition",
    });

    return {
      verdict: cleanString(verdict) === "yes",
      message: requirement.message,
    };
  } catch (err) {
    throw httpError(err);
  }
}
