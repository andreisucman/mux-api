import * as dotenv from "dotenv";
dotenv.config();

import { CategoryNameEnum } from "@/types.js";
import askTogether from "./askTogether.js";
import httpError from "@/helpers/httpError.js";
import { keepNumbersAndCommas, urlToBase64 } from "@/helpers/utils.js";

type Props = {
  userId: string;
  image: string;
  categoryName: CategoryNameEnum;
};

export default async function checkPeopleSimilarity({
  userId,
  image,
  categoryName,
}: Props) {
  try {
    const messages = [
      {
        role: "system",
        content: `Each row of images represents a person. Which rows show the same person? Respond with the row numbers from the top left corner of each row.`,
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
      {
        role: "system",
        content: `YOUR RESPONSE IS A COMMA-SEAPRATED STRING OF ROW NUMBERS.`,
      },
    ];

    const response = await askTogether({
      messages,
      userId,
      categoryName,
      model: process.env.LLAMA_11B_VISION,
      functionName: "checkPeopleSimilarity",
    });

    const commaSeparatedNumbers = keepNumbersAndCommas(response);

    return commaSeparatedNumbers.split(",");
  } catch (err) {
    throw httpError(err);
  }
}
