import z from "zod";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import httpError from "@/helpers/httpError.js";

type Props = {
  image: string;
  requisite: string;
  userId: string;
  categoryName: string;
};

export default async function checkProofImage({
  image,
  requisite,
  userId,
  categoryName,
}: Props) {
  try {
    const systemContent = `You are given a frame from the video. Does it depict the following: ${requisite}? Format your response as a JSON object with the following structure: {verdict: false if not, true if yes, explanation: explain to the user what is wrong with the video in the 2nd tense (you/your) and ask to retry}.`;

    const CheckProofImageResponseType = z.object({
      verdict: z.boolean(),
      explanation: z.string(),
    });

    const runs = [
      {
        isMini: true,
        content: [
          {
            type: "image_url",
            image_url: { url: image, detail: "low" },
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
