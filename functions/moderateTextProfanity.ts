import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  text: string;
  userId: string;
};

export default async function moderateTextProfanity({ userId, text }: Props) {
  try {
    const systemContent = `Check whether the user's text contains inappropriate language, including vulgarity or strong profanity that is unsuitable for public display.`;

    const ModerateTextProfanityResponseType = z.object({
      containsProfanity: z.boolean().describe("True if contains, false if not"),
    });

    const runs = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text,
          },
        ],
        responseFormat: zodResponseFormat(
          ModerateTextProfanityResponseType,
          "ModerateTextProfanityResponseType"
        ),
      },
    ];

    const response = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId,
    });

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
