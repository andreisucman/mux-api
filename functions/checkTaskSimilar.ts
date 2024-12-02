import z from "zod";
import askRepeatedly from "@/functions/askRepeatedly.js";
import addErrorLog from "functions/addErrorLog.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

type Props = {
  userId: string;
  description: string;
  newDescription: string;
  instruction: string;
  newInstruction: string;
};

export default async function checkTaskSimilar({
  userId,
  description,
  newDescription,
  instruction,
  newInstruction,
}: Props) {
  const condition =
    "The activity described in the new description and instruction related to the activity described in the old description or instruction, even though the method of implementation may vary.";

  try {
    const systemContent = `The user gives you a set of old and new information about an activity. Your goal is to check if it satisfies this condition: ${condition}. Your response is true if yes, and false if not.`;

    const CheckTaskType = z.object({ satisfies: z.boolean() });

    const runs = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Old description: ${description}<-->Old instruction: ${instruction}<-->New description: ${newDescription}.<-->New instruction: ${newInstruction}.`,
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

    return response.satisfies;
  } catch (err) {
    addErrorLog({ message: err.message, functionName: "checkTaskSimilar" });
    throw err;
  }
}
