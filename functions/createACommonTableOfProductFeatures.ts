import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import { toSentenceCase } from "@/helpers/utils.js";

type Props = {
  userId: string;
  categoryName: string;
  extractedVariantFeatures: { featuresAndFunctionalities: string }[];
};

export default async function createACommonTableOfProductFeatures({
  userId,
  extractedVariantFeatures,
  categoryName,
}: Props) {
  const CommonTableFeaturesType = z.object({
    commonFeaturesList: z
      .array(z.string())
      .describe("An array of product comparison criteria check points"),
  });

  try {
    const originalList = extractedVariantFeatures
      .flatMap((obj) => obj.featuresAndFunctionalities)
      .join("\n");

    /* find the related variants */
    const systemContent = `You are given the features and functionalities of several products after ###. Your goal is to create a product comparison check list based on them. Think step-by-step. ### The features and functionalities: ${originalList}`;

    const runs: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Create a new common list of product comparison criteria based on the information provided.`,
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
            text: `Remove any specific product's details, making each criteria generic and applicable to each product.`,
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

    const response = await askRepeatedly({
      systemContent,
      runs,
      userId,
      categoryName,
      functionName: "createACommonTableOfProductFeatures",
    });

    let commonFeaturesList = [];

    if (response.commonFeaturesList) {
      commonFeaturesList = response.commonFeaturesList.map((feature: string) =>
        toSentenceCase(feature)
      );
    }

    return commonFeaturesList;
  } catch (err) {
    throw httpError(err);
  }
}
