import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  url: string;
  userAbout?: string;
};

export default async function analyzeCalories({
  url,
  userId,
  userAbout,
}: Props) {
  try {
    const systemContent = `You are a food composition analysis expert. The user gives you an image of food. Your goal is to determine how much energy, protein, carbohydrates and fats it has in as few words as possible. Consider the size of the portion and and the proportion of the products in it. If you can't determine the ingredients make your best guess. Think step-by-step.`;

    const AnalyzeCaloriesResponseFormat = z.object({
      energy: z.number(),
      proteins: z.number(),
      carbohydrates: z.number(),
      fats: z.number(),
    });

    const runs: RunType[] = [
      {
        isMini: false,
        content: [
          {
            type: "image_url",
            image_url: { url, detail: "low" },
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "Consider whether the ingredients are cooked or raw and how it impacts their nutritional values. Format your response like this: {energy: number of kcal, protein: number of proteins in grams, carbohydrates: number of carbohydrates in grams, fats: number of fats in grams}.",
          },
        ],
        responseFormat: zodResponseFormat(
          AnalyzeCaloriesResponseFormat,
          "AnalyzeCaloriesResponseFormat"
        ),
      },
    ];

    const analysisResponse = await askRepeatedly({
      runs,
      userId,
      systemContent,
      functionName: "analyzeCalories",
    });

    let shouldEatResponse = { shouldEat: true, explanation: "" };

    if (userAbout) {
      const systemContent = `The user gives you an image of a food and the information about them. Your goals are: 1) determine if eating this food is detrimental for the user based on their info and the food's ingredients. 2) Give a one-sentence explanation in the 2nd tense (you/your). Think step-by-step.`;

      const ShouldEatResponseFormat = z.object({
        shouldEat: z.boolean(),
        explanation: z.string(),
      });

      const runs: RunType[] = [
        {
          isMini: true,
          content: [
            { type: "image_url", image_url: { url, detail: "low" } },
            {
              type: "text",
              text: `User information. ${userAbout}`,
            },
          ],
          responseFormat: zodResponseFormat(
            ShouldEatResponseFormat,
            "ShouldEatResponseFormat"
          ),
        },
      ];

      shouldEatResponse = await askRepeatedly({
        runs,
        userId,
        systemContent,
        functionName: "analyzeCalories",
      });
    }

    return { ...analysisResponse, ...shouldEatResponse };
  } catch (err) {
    throw httpError(err);
  }
}
