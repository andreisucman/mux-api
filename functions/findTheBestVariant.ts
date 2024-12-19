import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import {
  ProductType,
  SimplifiedProductType,
} from "@/types/findTheBestVariant.js";
import { UserInfoType, SuggestionType, UserConcernType } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  key: string;
  analysisType: string;
  userInfo: UserInfoType;
  validProducts: ProductType[];
  commonListOfFeatures: string[];
  taskDescription: string;
  concerns: UserConcernType[];
  criteria: string;
};

export default async function findTheBestVariant({
  key,
  concerns,
  criteria,
  userInfo,
  analysisType,
  validProducts,
  taskDescription,
  commonListOfFeatures,
}: Props) {
  const simplifiedVariants = validProducts.map((variant: ProductType) => ({
    name: variant.name,
    description: variant.description,
    asin: variant.asin,
    rating: variant.rating,
    unitPrice: variant.unitPrice,
  }));

  const { _id: userId, demographics, specialConsiderations } = userInfo;
  const { sex, ageInterval, skinType, ethnicity } = demographics;

  const callback = () =>
    incrementProgress({
      userId: String(userId),
      increment: 5,
      operationKey: analysisType,
    });

  const concernKeys = concerns.map((c) => c.name).join(",");

  const userDescription = `Sex: ${sex}.<-->Age interval: ${ageInterval}.<-->Skin type: ${skinType}.<-->Ethnicity: ${ethnicity}.<-->Criteria: ${criteria}.<-->Concerns: ${concernKeys}.`;

  const list = simplifiedVariants
    .map(
      (rec: ProductType, index: number) =>
        `Product ${index + 1}. Name: ${rec.name}. Description: ${
          rec.description
        }. Asin: ${rec.asin}. Reviews rating: ${rec.rating}. Unit price: ${
          rec.unitPrice
        }`
    )
    .join("\n");

  const listOfUniqueFeatures = [...new Set(commonListOfFeatures)];
  const featuresList = listOfUniqueFeatures.join("\n");

  const analysisObject = listOfUniqueFeatures.reduce<
    Record<string, z.ZodType<any>>
  >((a, c) => {
    a[c] = z.boolean();
    return a;
  }, {});

  const FeatureAnalysisType = z.object(analysisObject);

  try {
    /* find the related variants */
    const systemContent = `You are the user's purchase advisor. Your goal is to rank the products that suit the user best according to their criteria, use case and description. ##User's use case: ${taskDescription}. ##User's criteria: ${criteria}. ##User description: ${userDescription}. Consider rank 1 to be the highest. Be detailed. Use casual and objective language. Think step-by-step.`;

    const runs: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Products: ${list}##.`,
          },
        ],
        callback,
      },
    ];

    runs.push(
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Create the analysisResult for each product with this structure {[key: string]: boolean}, where key is the name of the feature from this features list: ##${featuresList}##, and the value is a boolean of true if the feature is present in the product or false if not.`,
          },
        ],
        responseFormat: zodResponseFormat(
          FeatureAnalysisType,
          "FeatureAnalysisType"
        ),
        callback,
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Rank the products based on this criteria: ${criteria}. The highest rank is 1.`,
          },
        ],
        callback,
      }
    );

    if (specialConsiderations) {
      runs.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `The user has the following special consideration: ##${specialConsiderations}##. Does it influence the ranking of the products? If yes, rerank the products.`,
          },
        ],
        callback,
      });
    }

    runs.push(
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Rephrase your reasoning in the 2nd tense (you/yours). Discuss both the pros and cons of each product for the user and how they influenced ranking.`,
          },
        ],
        callback,
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Does this product have any drawbacks compared to the other products? If yes, discuss them.`,
          },
        ],
        callback,
      }
    );

    const FindTheBestVariantResponseType = z.object({
      rankedProducts: z.array(
        z.object({
          rank: z.number(),
          name: z.string(),
          reasoning: z.string(),
          asin: z.string(),
          analysisResult: z.object(analysisObject),
        })
      ),
    });

    runs.push({
      isMini: true,
      content: [
        {
          type: "text",
          text: `Format your response as a JSON object, with this structure: {rankedProducts: [{rank: number, name: product name, reasoning: your reasoning for the rank in the 2nd tense (you/your), asin: asin of the product, analysisResult: {criteria1: true if satisfies, false otherwise, criteria2: true if satisfied fasle otherwise, ...}}]}.`,
        },
      ],
      responseFormat: zodResponseFormat(
        FindTheBestVariantResponseType,
        "FindTheBestVariantResponseType"
      ),
      callback,
    });

    const response = await askRepeatedly({
      systemContent,
      runs,
      userId: String(userId),
      functionName: "findTheBestVariant",
    });

    const { rankedProducts } = response || [];

    const enrichedProducts: SuggestionType[] = rankedProducts
      .map((product: SimplifiedProductType) => {
        const match = validProducts.find((vp) => vp.asin === product.asin);

        if (!match) return;

        return { ...match, ...product, key };
      })
      .filter(Boolean);

    return enrichedProducts;
  } catch (err) {
    throw httpError(err);
  }
}
