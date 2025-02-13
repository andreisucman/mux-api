import incrementProgress from "@/helpers/incrementProgress.js";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "types/askOpenaiTypes.js";
import { StyleGoalsType, TypeEnum, CategoryNameEnum } from "types.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";

type Props = {
  userId: string;
  image: string;
  currentStyle: string;
  type: TypeEnum;
  categoryName: CategoryNameEnum;
  styleGoals: StyleGoalsType;
};

export default async function suggestChange({
  image,
  type,
  categoryName,
  currentStyle,
  styleGoals,
  userId,
}: Props) {
  try {
    const { name: styleName, description } = styleGoals;

    let analysisSystemContent = `You are given the user's image, and the description of the outlook style they want. Come up with the meaningful suggestions on what the user should change in their current outlook to match the style they are going for.`;

    if (type === "head") {
      analysisSystemContent += `In your analysis consider only the head and neck parts of the person. Avoid speaking about outfit. Your suggestions can include changes in hair length, hair style, hair color, accessories, piercing, tattoos, grooming, ear and neck jewellery. Pay attention to the user's face shape, hair type and other demographic features when determining what to suggest them.`;
    }

    if (type === "body") {
      analysisSystemContent += `In your analysis consider only the body parts of the person. Avoid sayin anything about face. Your suggestions can include changes in specific parts of the clothing, shoes, accessories, colors, materials, attire combinations. Consider the user's weight, height, proportions and other demographic features when determining which of your suggestions would look good on them.`;
    }

    analysisSystemContent += `Think step-by-step. Use only the information provided.`;

    const runs = [
      {
        isMini: false,
        content: [
          {
            type: "image_url" as "image_url",
            image_url: {
              url: await urlToBase64(image),
              detail: "low" as "low",
            },
          },
          {
            type: "text" as "text",
            text: `<-->The use is going for the ${styleName} style outlook. ${description}<-->`,
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 15,
            userId,
          }),
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: "Are you giving specific suggestions to the user? If not make your suggestions concrete and specific. Like 'do this...' and 'don't do that...' Avoid giving a choice, be definite. If you're suggesting a product, describe how it looks and where can be acquired. If you are suggesting a procedure, describe how to do it.",
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 20,
            userId,
          }),
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: "What specific features of the user made you think your suggestions are appropriate for them? Speak about those directly and in detail.",
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 15,
            userId,
          }),
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "Combine everything you've said so far in a single final response.",
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 25,
            userId,
          }),
      },
    ];

    const response = await askRepeatedly({
      userId,
      categoryName,
      systemContent: analysisSystemContent,
      runs: runs as RunType[],
      isResultString: true,
      functionName: "suggestChange",
    });

    const formattingSystemContent = `You are given the user's current style name, their goal style name, and the improvement suggestions for changing the style. Your goal is to rephrase and format this information in the 2nd tense (you/your) and an engaging language. Don't make things up. Think step-by-step.`;

    const formattingRuns = [
      {
        isMini: false,
        content: [
          {
            type: "text" as "text",
            text: `<-->Current style: ${currentStyle}.<-->Goal stye: ${styleName}<-->Suggestion: ${response}.`,
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 25,
            userId,
          }),
        model: "ft:gpt-4o-mini-2024-07-18:personal:suggest-change:AGSTdYpw",
      },
    ];

    const rephrased = await askRepeatedly({
      userId,
      categoryName,
      systemContent: formattingSystemContent,
      runs: formattingRuns,
      isResultString: true,
      seed: 1100893210,
      functionName: "suggestChange",
    });

    return rephrased;
  } catch (err) {
    throw httpError(err);
  }
}
