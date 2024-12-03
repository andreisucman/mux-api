import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  extractedVariantFeatures: { featuresAndFunctionalities: string }[];
};

export default async function createACommonTableOfProductFeatures({
  userId,
  extractedVariantFeatures,
}: Props) {
  const CommonTableFeaturesType = z.object({
    commonFeaturesList: z.array(z.string()),
  });

  try {
    const originalList = extractedVariantFeatures
      .flatMap((obj) => obj.featuresAndFunctionalities)
      .join("\n");

    /* find the related variants */
    const systemContent = `You are given the features and functionalities of several products after ###. Your goal is to create a check list based on them. Think step-by-step. ### The features and functionalities: ${originalList}`;

    const runs: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Based on the data you have create a new common list of criteria for this type of products.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Go over the criteria and remove specific product's details from it, making the list applicable to all products.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Remove the criteria that are not related to ingredients, materials, formulation, or method of preparation.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Remove the criteria that doesn't tell anything specific.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Rewrite the names of the criteria in the sentence case.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Format your latest list of criteria as a JSON with this format: {commonFeaturesList: [Non-greasy formula, Cruelty-free, ...]}`,
          },
        ],
        responseFormat: zodResponseFormat(
          CommonTableFeaturesType,
          "CommonTableFeaturesType"
        ),
      },
    ];

    const response = await askRepeatedly({ systemContent, runs, userId });

    return response.commonFeaturesList;
  } catch (err) {
    throw httpError(err);
  }
}
