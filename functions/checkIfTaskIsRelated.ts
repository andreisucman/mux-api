import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { PartEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { CategoryNameEnum } from "types.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import httpError from "@/helpers/httpError.js";

type Props = {
  text: string;
  part: PartEnum;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function checkIfTaskIsRelated({
  userId,
  part,
  text,
  categoryName,
}: Props) {
  try {
    const systemContent = `The user gives you a description of an activity. Your goal is to check if it satisfies this condition: The activity must be related to ${part}. Your response is true if yes, and false if not.`;

    const CheckTaskType = z.object({ satisfies: z.boolean() });

    const runs = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Activity description: ${text}`,
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
      functionName: "checkIfTaskIsRelated",
    });

    return response.satisfies;
  } catch (err) {
    throw httpError(err);
  }
}
