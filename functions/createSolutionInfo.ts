import { CategoryNameEnum } from "@/types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";
import askRepeatedly from "./askRepeatedly.js";
import httpError from "@/helpers/httpError.js";
import { generateRandomPastelColor } from "make-random-color";
import searchYoutubeVideo from "./searchYoutubeVideo.js";
import generateImage from "./generateImage.js";
import findRelevantSuggestions from "./findRelevantSuggestions.js";

type Props = {
  solution: string;
  concern: string;
  description: string;
  instruction: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function createSolutionInfo({
  solution,
  description,
  instruction,
  userId,
  concern,
  categoryName,
}: Props) {
  try {
    const systemContent = `The user gives you the info about an activity. Your goal is to create a task based on it.`;

    const TaskResponseType = z.object({
      name: z.string().describe("The name of the task in imperative form"),
      icon: z
        .string()
        .describe(
          "The closest unicode icon from node-emoji for this activity based on description and instructon"
        ),
      requisite: z
        .string()
        .describe(
          "The requisite that the user has to provide to prove the completion of the task"
        ),
      restDays: z
        .number()
        .describe(
          "Number of days the user should rest before repeating this activity"
        ),
      isDish: z.boolean().describe("true if this activity is a food dish"),
      productTypes: z
        .array(z.string())
        .describe(
          'An array of unique in their purpose product types in singular form (example: ["olive oil","tomato","onion"]). If multiple similar product types can be used, pick one - the most relevant.'
        ),
    });

    const runs: RunType[] = [
      {
        content: [
          {
            type: "text",
            text: `Activity description: ${description}.<-->Activity instruction: ${instruction}.`,
          },
        ],
        model:
          "ft:gpt-4o-mini-2024-07-18:personal:save-task-from-description:AIx7makF",
        responseFormat: zodResponseFormat(TaskResponseType, "TaskResponseType"),
      },
    ];

    const data = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId,
      categoryName,
      functionName: "saveTaskFromDescription",
    });

    const color = generateRandomPastelColor();

    const response = {
      ...data,
      key: solution,
      color,
      concern,
      description,
      instruction,
    };

    if (data.isDish) response.recipe = null;

    const youtubeVideo = await searchYoutubeVideo(`How to ${data.name}`);

    if (youtubeVideo) {
      response.example = { type: "video", url: youtubeVideo };
    } else {
      const image = await generateImage({
        description,
        userId,
        categoryName,
      });
      response.example = { type: "image", url: image };
    }

    const suggestions = await findRelevantSuggestions(data.productTypes);

    response.suggestions = suggestions;

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
