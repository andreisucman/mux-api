import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  variantData: { name: string; description: string; suggestion: string };
  taskDescription: string;
};

export default async function isTheProductValid({
  userId,
  variantData,
  taskDescription,
}: Props) {
  const { name, description, suggestion } = variantData;

  try {
    const systemContent = `The user gives you a description of a product from amazon.com. Your goal is to identify if this product is relevant for this task: ##${taskDescription}##. Your response is a json object with this format: {verdict: true if the product conforms the task description, false if not}`;

    const runs: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Product name: ${name}. Product description: ${description}. Product type: ${suggestion}.`,
          },
        ],
      },
    ];

    const response = await askRepeatedly({
      systemContent,
      runs,
      userId,
      functionName: "isTheProductValid",
    });

    return {
      ...variantData,
      verdict: response.verdict,
    };
  } catch (err) {
    throw httpError(err);
  }
}
