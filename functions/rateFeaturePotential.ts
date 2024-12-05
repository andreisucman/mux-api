import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import criteria from "data/featureCriteria.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { SexEnum, TypeEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { FeaturePotentialAnalysisType } from "@/types/rateFeaturePotentialTypes.js";
import httpError from "@/helpers/httpError.js";

type RateFeaturePotentialProps = {
  userId: string;
  sex: SexEnum;
  type: TypeEnum;
  currentScore: number;
  feature: string;
  ageInterval: string;
  images: string[];
};

export default async function rateFeaturePotential({
  userId,
  sex,
  type,
  currentScore,
  feature,
  ageInterval,
  images,
}: RateFeaturePotentialProps) {
  try {
    const initialSystemContent =
      type === "body"
        ? `You are given the user's images, a grading criteria, the body part and its esthetics score. Your goal is to come up with the HIGHERST POSSIBLE esthetic beauty score achievable for that body part without surgical intervention based on the grading criteria. <-->1. Describe the current condition from the images. Talk about the specific muscle groups, the extent of muscle sculpting, the development of the relevant muscle groups relative to the other body parts, etc. 2. Think what would be the highest potential score this person can achieve based on their age and any permanent structural defects (if present). 3. Give your detailed reasoning about why you think the potential score is this an not higher or lower? Be detailed. Think step-by-step.`
        : `You are given the user's images, a grading criteria, the body part and its esthetics score. Your goal is to come up with the HIGHERST POSSIBLE esthetic beauty score achievable for that body part without surgical intervention based on the grading criteria. <-->1. Describe the current condition from the images. Talk about the relevant attributes of the face part such as wrinkles, texture, color, elasticity, pigmentation, excess of hair, lack of hair etc. 2. Think what would be the highest potential score this person can achieve based on their age and any permanent structural defects (if present). 3. Give your detailed reasoning about why you think the potential score is this an not higher or lower? Be detailed. Think step-by-step.
    `;

    const initialRuns = [
      {
        isMini: false,
        content: [
          ...images.map((image) => ({
            type: "image_url",
            image_url: {
              url: image,
              detail: "low",
            },
          })),
          { type: "text", text: `The ${type} part to analyze is: ${feature}.` },
          {
            type: "text",
            text: `The user's current esthetic score is: ${currentScore}.`,
          },
          { type: "text", text: `The user's age interval is: ${ageInterval}.` },
          {
            type: "text",
            text: `Grading criteria is: ${
              criteria[sex as SexEnum.FEMALE][type as TypeEnum.BODY][
                feature as "belly"
              ]
            }.`,
          },
        ],
        callback: () => incrementProgress({ operationKey:type, userId, increment: 1 }),
      },
    ];

    const initialResponse = await askRepeatedly({
      userId,
      systemContent: initialSystemContent,
      runs: initialRuns as RunType[],
      isResultString: true,
    });

    const finalSystemContent = `You are given a description of the user's body part and it's current esthetic score. Your goal is to format the description in the 2nd tense (you/your) with a better flow and a more cohesive context. Your response must be entirely based on the information you are given. Don't make things up. Rate is the upper boundary of the highest achievable esthetic score for the body part. Explanation is your description and reasoning. Think step-by-step.`;

    const FormatResponseAsRateAndExplanationType = z.object({
      rate: z.number(),
      explanation: z.string(),
    });

    const finalRuns = [
      {
        isMini: true,
        model:
          "ft:gpt-4o-mini-2024-07-18:personal:ratefeaturepotential:AAyC7tYS",
        content: [
          {
            type: "text",
            text: `The ${type} part to analyze is: ${feature}.<-->The user's current score is: ${currentScore}<-->The user's highest potential score is: ${
              initialResponse.score
            }<-->The user's age interval is: ${ageInterval}.<-->The user's sex is: ${
              sex === "all" ? "male or female" : sex
            }<-->The description is: ${initialResponse}`,
          },
        ],
        responseFormat: zodResponseFormat(
          FormatResponseAsRateAndExplanationType,
          "rateFeaturePotentialRephraseOne"
        ),
        callback: () => incrementProgress({ operationKey:type, userId, increment: 1 }),
      },
    ];

    const finalResponse: { rate: number; explanation: string } =
      await askRepeatedly({
        userId,
        systemContent: finalSystemContent,
        runs: finalRuns as RunType[],
        seed: 263009886,
      });

    const { rate, explanation } = finalResponse;

    const updated: FeaturePotentialAnalysisType = {
      score: rate,
      explanation: explanation,
      feature,
      type,
    };

    return updated;
  } catch (err) {
    throw httpError(err);
  }
}
