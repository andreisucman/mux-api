import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  text: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function isActivityHarmful({
  userId,
  text,
  categoryName,
}: Props) {
  try {
    const systemContent = `The user gives you a description of an activity. Your goal is to check if it has an intent of harming the person who performs it. An activity has an intent of harming if it clearly leads to health damage.`;

    const IsSafeResponseType = z.object({
      isHarmful: z.boolean().describe("true if harfmul, false if not"),
      explanation: z
        .string()
        .describe(
          "if harmful one sentence explanation of why you think this text is harmful, else empty string"
        ),
    });

    const runs = [
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "text",
            text: `Activity description: ${text}`,
          },
        ],
        responseFormat: zodResponseFormat(
          IsSafeResponseType,
          "IsSafeResponseType"
        ),
      },
    ];

    const response = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId,
      categoryName,
      functionName: "isActivityHarmful",
    });

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
