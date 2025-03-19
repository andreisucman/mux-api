import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "@/functions/askRepeatedly.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  userId: string;
  taskNames: string[];
};

export default async function findEmoji({ taskNames, userId }: Props) {
  const systemContent = `The user gives you the names of activities. Your goal is to find a related icon for each activity from node-emoji. Return the icon in the UNICODE format. Make sure that your suggested icon really does exist in node-emoji package in the UNICODE format.`;

  const taskResponseTypeSchema = taskNames.reduce((a, c) => {
    a[c] = z
      .string()
      .describe(
        `An icon from node-emoji that is the closest related to this ${c} in UNICODE format.`
      );

    return a;
  }, {});

  const TaskResponseType = z
    .object(taskResponseTypeSchema)
    .describe("name:UNICODE emoji map");

  const runs: RunType[] = [
    {
      content: [
        {
          type: "text",
          text: `Activities: ${taskNames.join("\n")}. `,
        },
      ],
      model:
        "ft:gpt-4o-mini-2024-07-18:personal:save-task-from-description:AIx7makF",
      responseFormat: zodResponseFormat(TaskResponseType, "TaskResponseType"),
    },
  ];

  const response = await askRepeatedly({
    systemContent: systemContent,
    runs: runs as RunType[],
    userId,
    categoryName: CategoryNameEnum.TASKS,
    functionName: "findEmoji",
  });

  return response;
}
