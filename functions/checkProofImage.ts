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
    const systemContent = `You are given a frame from the video. Does it appear like the user did what is requested in the following requisite: ${requisite}? Don't be strict, decline only if the process on the image is entirely irrelevant. Format your response as a JSON object with the following structure: {verdict: false if not, true if yes, explanation: explain to the user what is wrong with the video in the 2nd tense (you/your) and ask to retry}.`;

    const CheckProofImageResponseType = z.object({
      verdict: z
        .boolean()
        .describe("true if meets the requisite, false if not"),
      explanation: z.string(),
    });

    const runs = [
      {
        isMini: true,
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
