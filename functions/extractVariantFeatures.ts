import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import addErrorLog from "functions/addErrorLog.js";
import { RunType } from "@/types/askOpenaiTypes.js";

type Props = {
  userId: string;
  variantData: { name: string; description: string };
  taskDescription: string;
};

export default async function extractVariantFeatures({
  userId,
  variantData,
  taskDescription,
}: Props) {
  const { name, description } = variantData;

  try {
    /* find the related variants */
    const systemContent = `You are given a name and description of a product from amazon.com after ###. Extract all of it's features that are related to this use case: ${taskDescription}. Think step-by-step. ### Product name: ${name}. Product description: ${description}.`;

    const VariantFeaturesType = z.object({
      featuresAndFunctionalities: z.array(z.string()),
    });

    const runs: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Are the features and functionalities you extracted mentioned in the description of the product? Remove those that are not.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Rewrite the list and leave only specific information from the description. Example: Does not weigh down hair. \nDoesn't contain fragrance. \nVegan and cruelty-free.\nClinically tested.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Eliminate all claims that can't be objectively checked in a lab setting.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Format your response as a JSON object with this structure: {featuresAndFunctionalities: [string, string, ...]}. Example: {featuresAndFunctionalities: ["Does not weigh down hair", "Non-greasy formula", "Cruelty-free"...]}`,
          },
        ],
        responseFormat: zodResponseFormat(
          VariantFeaturesType,
          "VariantFeaturesType"
        ),
      },
    ];

    const response = await askRepeatedly({ systemContent, runs, userId });

    return {
      featuresAndFunctionalities: response.featuresAndFunctionalities,
      ...variantData,
    };
  } catch (err) {
    addErrorLog({
      functionName: "extractVariantFeatures",
      message: err.message,
    });
    throw err;
  }
}
