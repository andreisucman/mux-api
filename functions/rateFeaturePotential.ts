import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import criteria from "data/featureCriteria.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { SexEnum, CategoryNameEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { FeaturePotentialAnalysisType } from "@/types/rateFeaturePotentialTypes.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";

type RateFeaturePotentialProps = {
  userId: string;
  sex: SexEnum;
  currentScore: number;
  feature: string;
  categoryName: CategoryNameEnum;
  ageInterval: string;
  images: string[];
};

export default async function rateFeaturePotential({
  userId,
  sex,
  currentScore,
  feature,
  categoryName,
  ageInterval,
  images,
}: RateFeaturePotentialProps) {
  try {
    let initialSystemContent = `You are given the user's images, a grading criteria, the body part and its esthetics score. Your goal is to come up with the HIGHERST POSSIBLE esthetic beauty score achievable for that body part based on the grading criteria. <-->1. Describe the current condition from the images. Talk about the relevant attributes such as wrinkles, texture, color, elasticity, pigmentation, excess of hair, lack of hair, muscle eveopment, fat deposits etc. 2. Think what would be the highest potential score this person can achieve based on their age and any permanent structural defects (if present). 3. Give your detailed reasoning about why you think the potential score is this an not higher or lower?`;

    initialSystemContent += ` Be detailed. Don't recommend any solutions for improvement. Think step-by-step.`;

    const base64Images = [];

    for (const image of images) {
      base64Images.push({
        type: "image_url",
        image_url: {
          url: await urlToBase64(image),
          detail: "low",
        },
      });
    }

    const initialRuns = [
      {
        isMini: false,
        content: [
          ...base64Images,
          { type: "text", text: `The part to analyze is: ${feature}.` },
          {
            type: "text",
            text: `The user's current esthetic score is: ${currentScore}.`,
          },
          { type: "text", text: `The user's age interval is: ${ageInterval}.` },
          {
            type: "text",
            text: `Grading criteria is: ${
              criteria[sex as SexEnum.FEMALE][feature as "belly"]
            }.`,
          },
        ],
        callback: () =>
          incrementProgress({ operationKey: "progress", userId, increment: 1 }),
      },
    ];

    const initialResponse = await askRepeatedly({
      userId,
      categoryName,
      systemContent: initialSystemContent,
      runs: initialRuns as RunType[],
      isResultString: true,
      functionName: "rateFeaturePotential",
    });

    const finalSystemContent = `You are given a description of the user's body part, it's current esthetic score and its highest achievable esthetics score. Your goal is to rewrite the description in the 2nd tense (you/your) with a better flow and a more cohesive context. Your response must be entirely based on the information you are given. Don't make things up. Don't recommend any solutions for improvement. Think step-by-step.`;

    const FormatResponseAsRateAndExplanationType = z.object({
      rate: z
        .number()
        .describe("the highest achievable esthetic score for the body part"),
      explanation: z
        .string()
        .describe(
          "the description of the body part and the reasoning for the rate"
        ),
    });

    const finalRuns = [
      {
        isMini: true,
        model:
          "ft:gpt-4o-mini-2024-07-18:personal:rate-feature-potential:ArG0DtSK",
        content: [
          {
            type: "text",
            text: `The part to analyze is: ${feature}.<-->The user's current score is: ${currentScore}<-->The user's highest potential score is: ${
              initialResponse.score
            }<-->The user's age interval is: ${ageInterval}.<-->The user's sex is: ${
              sex === "all" ? "male or female" : sex
            }<-->The description is: ${initialResponse}.`,
          },
        ],
        responseFormat: zodResponseFormat(
          FormatResponseAsRateAndExplanationType,
          "rateFeaturePotentialRephraseOne"
        ),
        callback: () =>
          incrementProgress({ operationKey: "progress", userId, increment: 1 }),
      },
    ];

    const finalResponse: { rate: number; explanation: string } =
      await askRepeatedly({
        userId,
        categoryName,
        systemContent: finalSystemContent,
        runs: finalRuns as RunType[],
        seed: 263009886,
        functionName: "rateFeaturePotential",
      });

    const { rate, explanation } = finalResponse;

    const updated: FeaturePotentialAnalysisType = {
      score: rate,
      explanation: explanation,
      feature,
    };

    return updated;
  } catch (err) {
    throw httpError(err);
  }
}
