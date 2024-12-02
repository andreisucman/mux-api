import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "./askRepeatedly.js";
import addErrorLog from "./addErrorLog.js";
import { RunType } from "@/types/askOpenaiTypes.js";

type Props = {
  userId: string;
  image: string;
  condition: string;
};

export default async function validateImage({
  userId,
  image,
  condition,
}: Props) {
  try {
    const systemContent = `Does the image meet this condition: ${condition}? <-->Format your reponse as a JSON with this structure: {verdict: true if yes, false if not} `;

    const runs = [
      {
        isMini: true,
        content: [
          {
            type: "image_url",
            image_url: {
              url: image,
              detail: "low",
            },
          },
          {
            type: "text",
            text: systemContent,
          },
        ],
      },
    ];

    const ValidateImageResponse = z.object({
      verdict: z.boolean(),
    });

    const response = await askRepeatedly({
      userId,
      systemContent,
      runs: runs as RunType[],
      meta: "validateImage",
      responseFormat: zodResponseFormat(
        ValidateImageResponse,
        "ValidateImageResponse"
      ),
    });

    return { verdict: response.verdict };
  } catch (err) {
    addErrorLog({
      message: err.message,
      functionName: "validateImage",
    });
    throw err;
  }
}
