import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { CategoryNameEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";

type Props = {
  userId: string;
  image: string;
  categoryName: CategoryNameEnum;
  condition: string;
};

export default async function validateImage({
  userId,
  image,
  categoryName,
  condition,
}: Props) {
  try {
    const systemContent = `Does the image meet this condition: ${condition}?`;

    const ValidateImageResponse = z.object({
      verdict: z.boolean().describe("true if yes, false if not"),
    });

    const runs = [
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "image_url",
            image_url: {
              url: await urlToBase64(image),
              detail: "low",
            },
          },
          {
            type: "text",
            text: systemContent,
          },
        ],
        responseFormat: zodResponseFormat(
          ValidateImageResponse,
          "ValidateImageResponse"
        ),
      },
    ];

    const response = await askRepeatedly({
      userId,
      categoryName,
      systemContent,
      runs: runs as RunType[],
      functionName: "validateImage",
    });

    return response.verdict;
  } catch (err) {
    throw httpError(err);
  }
}
