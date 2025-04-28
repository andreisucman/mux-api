import { CategoryNameEnum } from "@/types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";
import askRepeatedly from "./askRepeatedly.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  icon: string;
  color: string;
  task: string;
  concern: string;
  description: string;
  instruction: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function createSolutionInfo({
  task,
  icon,
  color,
  description,
  instruction,
  userId,
  concern,
  categoryName,
}: Props) {
  try {
    const systemContent = `The user gives you the info about an activity. Your goal is to create a task based on it. If no products are needed to complete this task return an empty array for productTypes.`;

    const productTypesSchema = z.union([
      z
        .array(z.string().describe("name of a product or empty string"))
        .describe(
          'An array of product types that are required for completing this task in singular form or empty string if not products are required (example: ["moisturizer","tomato","brush",...]).'
        ),
      z.null(),
    ]);

    const TaskResponseType = z.object({
      name: z.string().describe("The name of the task in imperative form"),
      requisite: z.string().describe("The requisite that the user has to provide to prove the completion of the task"),
      restDays: z.number().describe("Number of days the user should rest before repeating this activity"),
      isDish: z.boolean().describe("true if this activity is a dish that has to be prepared before eating"),
      isFood: z.boolean().describe("true if this activity is a food"),
      productTypes: productTypesSchema,
    });

    const runs: RunType[] = [
      {
        content: [
          {
            type: "text",
            text: `Activity description: ${description}.<-->Activity instruction: ${instruction}.`,
          },
        ],
        model: "ft:gpt-4o-mini-2024-07-18:personal:save-task-from-description:AIx7makF",
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

    const { isFood, ...restData } = data;

    const response = {
      ...restData,
      icon,
      color,
      key: task,
      concern,
      description,
      instruction,
      productTypes: data.productTypes.filter((s: string) => s),
      examples: [],
    };

    if (data.isFood) {
      response.previousRecipe = null;
    }

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
