import { CategoryNameEnum } from "@/types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";
import askRepeatedly from "./askRepeatedly.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  task: string;
  concern: string;
  part: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function createSolutionDescriptionAndInstruction({
  task,
  concern,
  part,
  userId,
  categoryName,
}: Props) {
  try {
    const systemContent = `The user gives you the info about an activity. Your goal is to create a task based on this info.
                  Here is what you should to:
                  1. Create a 1 sentence description for the activity that tells what it is and why it is important for the user.
                  2. Create a concise step-by-step instruction for the activity where each step is on a new line (separated by \n).`;

    const TaskType = z.object({
      description: z.string(),
      instruction: z.string(),
    });

    const runs = [
      {
        content: [
          {
            type: "text",
            text: `Name of the actvity: ${task}`,
          },
          {
            type: "text",
            text: `Concern targeted: ${concern}. Relevant part of the body: ${part}.`,
          },
        ],
        model: "ft:gpt-4o-mini-2024-07-18:personal:create-task-from-description:BWQpM6ui",
        responseFormat: zodResponseFormat(TaskType, "task"),
      },
    ];

    const response = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId,
      categoryName,
      functionName: "createTaskFromDescription",
    });

    return { ...response, key: task };
  } catch (err) {
    throw httpError(err);
  }
}
