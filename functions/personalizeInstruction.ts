import askRepeatedly from "functions/askRepeatedly.js";
import incrementProgress from "helpers/incrementProgress.js";
import { RunType } from "types/askOpenaiTypes.js";
import { TypeEnum } from "types.js";
import httpError from "helpers/httpError.js";

type Props = {
  description: string;
  type: TypeEnum;
  instruction: string;
  userInfo: { [key: string]: any };
  name: string;
};

export default async function personalizeInstruction({
  description,
  type,
  instruction,
  userInfo,
  name,
}: Props) {
  const { city, country, specialConsiderations, _id: userId } = userInfo;

  const callback = () =>
    incrementProgress({ operationKey: type, userId, increment: 1 });

  try {
    const systemContent = `The user gives you a name, description, and instruction of a task. Your goal is to modify the instruction such that it closely aligns with the description, user's location, and current date. Be concise and to the point. Think step-by-step.`;

    const userContentArray = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Name of the task: ${name}. ## Description of the task: ${description}.## Instruction for the task: ${instruction}##`,
          },
          {
            type: "text",
            text: `The user's location is: ${city}, ${country}.`,
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
        isMini: true,
        content: [
          {
            type: "text",
            text: `The user has these special considerations: ${specialConsiderations}. Ensure your response respects them.`,
          },
        ],
        callback,
      });
    }

    userContentArray.push(
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "While editing the instruction have you considered each detail from the description, such as the type of the product or seasonality, etc...? If not, make your response account for them",
          },
        ],
        callback,
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "Does your instruction include any extra words other than the numbered sentences? If yes remove them.",
          },
        ],
        callback,
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "Format your response as a string of numbered steps where each step is separated by \n. Example of your response: 1. Buy one of the following fruits: peaches, plums, or apples.\n2. Eat the fruit.",
          },
        ],
        callback,
      }
    );

    const response: string = await askRepeatedly({
      userId,
      systemContent,
      runs: userContentArray as RunType[],
      isResultString: true,
    });

    return response;
  } catch (error) {
    throw httpError(error);
  }
}
