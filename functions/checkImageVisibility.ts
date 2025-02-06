import * as dotenv from "dotenv";
dotenv.config();

import { CategoryNameEnum } from "@/types.js";
import askTogether from "./askTogether.js";
import httpError from "@/helpers/httpError.js";
import { cleanString, urlToBase64 } from "@/helpers/utils.js";

type Props = {
  userId: string;
  image: string;
  categoryName: CategoryNameEnum;
};

export default async function checkImageVisibility({
  userId,
  image,
  categoryName,
}: Props) {
  try {
    const messages = [
      {
        role: "system",
        content: `Is the human on the image clearly visible with no shadows obscuring their features? Respond with a "yes" if yes, and "no" if no. Say nothing more but yes or no.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: await urlToBase64(image),
            },
          },
        ],
      },
    ];

    const verdict = await askTogether({
      messages,
      userId,
      categoryName,
      model: process.env.LLAMA_11B_VISION,
      functionName: "checkImageVisibility",
    });

    return cleanString(verdict) === "yes";
  } catch (err) {
    throw httpError(err);
  }
}
