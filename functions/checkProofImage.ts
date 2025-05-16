import z from "zod";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import httpError from "@/helpers/httpError.js";
import { CategoryNameEnum } from "@/types.js";
import { urlToBase64 } from "@/helpers/utils.js";

type Props = {
  image: string;
  name: string;
  requisite: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function checkProofImage({
  image,
  name,
  requisite,
  userId,
  categoryName,
}: Props) {
  try {
    const text = `${name}-${requisite}.`;
    const systemContent = `You are given the scenes of an activity from a video. Are they relevant to the following requisite: ${text}? Respond with true if the scenes are at least somewhat relevant to the requisite and false if the scenes are completely irrelevant.`;

    const CheckProofImageResponseType = z.object({
      verdict: z
        .boolean()
        .describe(
          "true if the scenes are at least somewhat relevant to the requisite, false if not"
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
