import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { ToAnalyzeType, CategoryNameEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";

type Props = {
  toAnalyze: ToAnalyzeType[];
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function getCalorieGoal({
  toAnalyze,
  userId,
  categoryName,
}: Props) {
  try {
    const systemContent = `You are a dietician. You are given an image of a person and a set of their physical concerns. Your goal is to determine how much kcal this person should consume to address their physical concerns best. Assume that the person is going to exercise for improving their concerns. Respond with a number representing the total kcal for a day. Think step-by-step`;

    const CalorieGoalResponseType = z.object({ kcal: z.number() });

    const frontalBody = toAnalyze.find(
      (obj) => obj.part === "body" && obj.position === "front"
    );

    if (!frontalBody)
      throw httpError(`Frontal body image not found for user ${userId}`);

    const runs = [
      {
        isMini: false,
        content: [
          {
            type: "image_url",
            image_url: {
              url: await urlToBase64(frontalBody.mainUrl.url),
              detail: "low",
            },
          },
          {
            type: "text",
            text: "Respond with a number representing the total kcal for a day.",
          },
        ],
        responseFormat: zodResponseFormat(
          CalorieGoalResponseType,
          "CalorieGoalResponseType"
        ),
      },
    ];

    const response = await askRepeatedly({
      systemContent,
      runs: runs as RunType[],
      userId,
      categoryName,
      functionName: "getCalorieGoal",
    });
    return response.kcal;
  } catch (err) {
    throw httpError(err);
  }
}
