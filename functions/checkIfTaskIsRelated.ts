import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { CategoryNameEnum } from "types.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  instruction: string;
  categoryName: CategoryNameEnum;
};

export default async function checkIfTaskIsAboutFood({
  userId,
  instruction,
  categoryName,
}: Props) {
  try {
    const systemContent = `Is the user's task about cooking or eating a food? `;

    const CheckTaskType = z.object({
      verdict: z.boolean().describe("true if yes, false if not"),
    });

    const runs = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Task: ${instruction}.`,
          },
        ],
        responseFormat: zodResponseFormat(CheckTaskType, "CheckTaskType"),
      },
    ];

    const response = await askRepeatedly({
      userId,
      categoryName,
      systemContent: systemContent,
      runs: runs as RunType[],
      functionName: "checkIfTaskIsAboutFood",
    });

    return response.verdict;
  } catch (err) {
    throw httpError(err);
  }
}
