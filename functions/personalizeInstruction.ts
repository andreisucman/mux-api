import askRepeatedly from "functions/askRepeatedly.js";
import incrementProgress from "helpers/incrementProgress.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CategoryNameEnum } from "types.js";
import httpError from "helpers/httpError.js";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

type Props = {
  description: string;
  categoryName: CategoryNameEnum;
  instruction: string;
  userInfo: { [key: string]: any };
  name: string;
};

export default async function personalizeInstruction({
  description,
  instruction,
  userInfo,
  categoryName,
  name,
}: Props) {
  const { country, specialConsiderations, _id: userId } = userInfo;

  const callback = () =>
    incrementProgress({ operationKey: "routine", userId, value: 1 });

  try {
    const systemContent = `The user gives you a name, description, and instruction of a task. Your goal is to modify the instruction such that it closely aligns with the description, user's location, and current date. Be concise and to the point. Think step-by-step.`;

    const userContentArray: RunType[] = [
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "text",
            text: `Name of the task: ${name}. ## Description of the task: ${description}.## Instruction for the task: ${instruction}##`,
          },
          {
            type: "text",
            text: `The user's country is: ${country}.`,
          },
          {
            type: "text",
            text: `The current date is ${new Date().toISOString()}.`,
          },
        ],
        callback,
      },
    ];

    if (specialConsiderations) {
      userContentArray.push({
        model: "gpt-4o-mini",
        content: [
          {
            type: "text",
            text: `The user has these special considerations: ${specialConsiderations}. Ensure your response respects them.`,
          },
        ],
        callback,
      });
    }

    const PersonalizeResponseType = z.object({
      instruction: z
        .array(z.string())
        .describe(
          'array of steps for completing the activity where each step is a numbered sentence. Example: ["1. Buy one of the following fruits: peaches, plums, or apples.","2. Eat the fruit."])'
        ),
      productTypes: z
        .array(z.string())
        .describe(
          'array of product types required for completing the activity. Example: ["dumbbell","yoga mat"])'
        ),
    });

    userContentArray.push({
      model: "gpt-4o-mini",
      content: [
        {
          type: "text",
          text: "While editing the instruction have you considered each detail from the description, such as the type of the product or seasonality, etc...? If not, make your response account for them",
        },
      ],
      responseFormat: zodResponseFormat(
        PersonalizeResponseType,
        "PersonalizeResponseType"
      ),
      callback,
    });

    const response = await askRepeatedly({
      userId,
      systemContent,
      categoryName,
      runs: userContentArray as RunType[],
      functionName: "personalizeInstruction",
    });

    return response;
  } catch (error) {
    throw httpError(error);
  }
}
