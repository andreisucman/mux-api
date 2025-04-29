import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  text: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function isActivityHarmful({ userId, text, categoryName }: Props) {
  try {
    const systemContent = `The user gives you a description of an activity. Your goal is to check if it has an intent of harming or defaming the person who performs it. An activity has an intent of harming or defaming if it clearly leads to health or dignity damage regardless of how it's performed. Your response is a JSON object with this structure: {hasIntentOfHarmOrDefamation: boolean, explanation: string | null}. If the activity is not harmful return explataion as null`;

    const runs = [
      {
        model: "deepseek-chat",
        content: [
          {
            type: "text",
            text: `Activity description: ${text}`,
          },
        ],
        responseFormat: { type: "json_object" },
      },
    ];

    const response = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId,
      categoryName,
      functionName: "isActivityHarmful",
    });

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
