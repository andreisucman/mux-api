import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import addErrorLog from "functions/addErrorLog.js";
import { TypeEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

type Props = {
  text: string;
  type: TypeEnum;
  userId: string;
};

export default async function checkIfTaskIsRelated({
  userId,
  type,
  text,
}: Props) {
  const condition =
    type === "head"
      ? "The activity must be related to face, mouth, or scalp."
      : type === "body"
      ? "The activity must be related to body improvement."
      : "The activity must be related to nutrition and health.";

  try {
    const systemContent = `The user gives you a description of an activity. Your goal is to check if it satisfies this condition: ${condition}. Your response is true if yes, and false if not.`;

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
      systemContent: systemContent,
      runs: runs as RunType[],
      userId,
    });

    return { satisfies: response.satisfies, condition };
  } catch (err) {
    addErrorLog({ message: err.message, functionName: "checkIfTaskIsRelated" });
    throw err;
  }
}
