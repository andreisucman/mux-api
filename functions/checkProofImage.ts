import z from "zod";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import httpError from "@/helpers/httpError.js";
import { CategoryNameEnum } from "@/types.js";
import { urlToBase64 } from "@/helpers/utils.js";

type Props = {
  image: string;
  requisite: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function checkProofImage({
  image,
  requisite,
  userId,
  categoryName,
}: Props) {
  try {
    const systemContent = `You are given a frame from the video. Is it relevant to the following requisite: ${requisite}? Don't be strict. The frame doesn't have to meet the requisite entirely. Decline only if the frame is completely irrelevant.`;

    const CheckProofImageResponseType = z.object({
      verdict: z
        .boolean()
        .describe(
          "true if the frame is relevant to the requisite, false if not"
        ),
      explanation: z
        .string()
        .describe(
          "explain what is wrong with the video in the 2nd tense (you/your) and ask to retry"
        ),
    });

    const runs = [
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "image_url",
            image_url: { url: await urlToBase64(image), detail: "low" },
          },
        ],
        responseFormat: zodResponseFormat(
          CheckProofImageResponseType,
          "CheckProofImageResponseType"
        ),
      },
    ];

    const response = await askRepeatedly({
      userId,
      systemContent,
      categoryName,
      runs: runs as RunType[],
      functionName: "checkProofImage",
    });

    const { verdict, explanation } = response || {};

    return { verdict, message: explanation };
  } catch (err) {
    throw httpError(err);
  }
}
