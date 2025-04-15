import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "@/functions/askRepeatedly.js";
import { CategoryNameEnum } from "@/types.js";
import { emojis } from "@/data/emojis.js";

const supportedEmojis = new Set(emojis);
const replacementEmojis = ["⚡", "🚩", "⭐", "🎯", "👍", "🚀", "🏆"];

type Props = {
  userId: string;
  taskNames: string[];
};

export default async function findEmoji({ taskNames, userId }: Props) {
  const systemContent = `The user gives you the names of activities. Your goal is to find an icon for each activity from node-emoji. Return the icon in the UNICODE format. Only return colored, native Unicode emojis. You must return a colored native emoji for each task name!`;

  const taskResponseTypeSchema = taskNames.reduce((a, c) => {
    a[c] = z.string().describe(`A colored, native Unicode emoji that is the closest related to this ${c}.`);
    return a;
  }, {} as Record<string, z.ZodString>);

  const TaskResponseType = z.object(taskResponseTypeSchema).describe("name:UNICODE emoji map");

  const runs: RunType[] = [
    {
      content: [
        {
          type: "text",
          text: `Activities: ${taskNames.join("\n")}. `,
        },
      ],
      model: "gpt-4o-mini",
      responseFormat: zodResponseFormat(TaskResponseType, "TaskResponseType"),
    },
  ];

  const response = await askRepeatedly({
    systemContent,
    runs: runs as RunType[],
    userId,
    categoryName: CategoryNameEnum.TASKS,
    functionName: "findEmoji",
  });

  const filteredResponse = Object.fromEntries(
    Object.entries(response).map(([task, emoji]: [string, string]) => [
      task,
      supportedEmojis.has(emoji) ? emoji : replacementEmojis[Math.floor(Math.random() * replacementEmojis.length)],
    ])
  );

  return filteredResponse;
}
