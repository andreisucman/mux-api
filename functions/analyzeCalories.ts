import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import httpError from "@/helpers/httpError.js";
import { CategoryNameEnum } from "@/types.js";
import { urlToBase64 } from "@/helpers/utils.js";
import { MessageContentPartParam } from "openai/resources/beta/threads/messages.mjs";
import { ChatCompletionContentPart } from "openai/resources/index.mjs";

type Props = {
  userId: string;
  url: string;
  taskDescription?: string;
  userAbout?: string;
  calorieGoal?: number;
  onlyCalories?: boolean;
  categoryName: CategoryNameEnum;
};

export default async function analyzeCalories({
  url,
  userId,
  taskDescription,
  userAbout,
  calorieGoal,
  categoryName,
  onlyCalories,
}: Props) {
  try {
    let systemContent = `You are a food composition analysis expert. The user gives you an image of food. Your goal is to determine its name, amount, and how much energy, protein, carbohydrates and fats it has. Consider:  1. whether the ingredients are cooked or raw, 2. the size of the plate and and the proportion of the products in it. If you can't say for sure make your best guess. Your response must be less than 20 words.`;

    const AnalyzeCaloriesResponseFormat = z.object({
      foodName: z.string().describe("name of the dish"),
      amount: z.number().describe("amount of food in the plate in grams"),
      energy: z.number().describe("number of kcal"),
      proteins: z.number().describe("number of proteins"),
      carbohydrates: z.number().describe("number of carbohydrates"),
      fats: z.number().describe("number of fats"),
      fiber: z.number().describe("number of fibers"),
    });

    const content: ChatCompletionContentPart[] = [
      {
        type: "image_url",
        image_url: { url: await urlToBase64(url), detail: "low" },
      },
    ];

    if (taskDescription) {
      content.push({
        type: "text",
        text: `The image is related to this task: ${taskDescription}`,
      });
    }

    const runs: RunType[] = [
      {
        model: "gpt-4o-mini",
        content,
      },
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "text",
            text: "Have you considered the size of the plate and whether the ingredients are raw or cooked? If not, revise your analysis with that in mind.",
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
      categoryName,
      functionName: "analyzeCalories",
    });

    if (onlyCalories) return analysisResponse;

    let shouldEatResponse = { shouldEat: true, explanation: "" };

    if (userAbout) {
      const systemContent = `The user gives you an image of a food and the information about them. Your goals are: 1) determine if eating this food is detrimental for the user based on their info and the food's ingredients. 2) Give a one-sentence explanation in the 2nd tense (you/your). Think step-by-step.`;

      const ShouldEatResponseFormat = z.object({
        shouldEat: z
          .boolean()
          .describe(
            "true if the user can safely eat this food, false if this food is prohibited for the user"
          ),
        explanation: z.string(),
      });

      const runs: RunType[] = [
        {
          model: "gpt-4o-mini",
          content: [
            {
              type: "image_url",
              image_url: { url: await urlToBase64(url), detail: "low" },
            },
            {
              type: "text",
              text: `User information. ${userAbout}`,
            },
          ],
        },
        {
          model: "gpt-4o-mini",
          content: [
            {
              type: "text",
              text: `Make sure that your verdict is grounded. If it's not change it.`,
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
        categoryName,
        systemContent,
        functionName: "analyzeCalories",
      });
    }

    const share = Math.min(
      Math.round((calorieGoal / analysisResponse.energy) * 100),
      100
    );

    return { ...analysisResponse, ...shouldEatResponse, share, calorieGoal };
  } catch (err) {
    throw httpError(err);
  }
}
