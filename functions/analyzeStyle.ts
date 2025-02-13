import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import incrementProgress from "@/helpers/incrementProgress.js";
import { CategoryNameEnum, TypeEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { outlookStyles } from "data/outlookStyles.js";
import { sortObjectByNumberValue, urlToBase64 } from "helpers/utils.js";
import askRepeatedly from "./askRepeatedly.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  image: string;
  categoryName: CategoryNameEnum;
};

export default async function analyzeStyle({
  image,
  categoryName,
  userId,
}: Props) {
  try {
    const analysisSystemContent = `You are given the names and descriptions of different outlook styles. Your goals are: 1) rate the user's appearance from 0 to 10 for each style based on how closely it matches that style 2) tell which style from the list the user is closest to in one word (e.g. minimalist). Analyze the person's facial features, hair style, physique, proportions, clothing, shoes, accessories, tattoes. Think step-by-step. Use only the information provided.`;

    const runs = [
      {
        isMini: true,
        content: [
          {
            type: "image_url" as "image_url",
            image_url: {
              url: await urlToBase64(image),
              detail: "low" as "low",
            },
          },
          {
            type: "text",
            text: `The list with names and descriptions of the outlook styles: ${outlookStyles.map(
              (style) =>
                `<-->Name: ${style.name}. Description: ${style.description}<-->\n`
            )}`,
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 5,
            userId,
          }),
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "Be strict in your analysis. If the person scores high in rugged they can't score high in classic as they are mutually exclusive styles. Give your scores with this in mind. Make your descriptions detailed. Describe the features of the individual and how they affected the score.",
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 10,
            userId,
          }),
      },
    ];

    const analysis = await askRepeatedly({
      userId,
      systemContent: analysisSystemContent,
      runs: runs as RunType[],
      isResultString: true,
      categoryName,
      functionName: "analyzeStyle",
    });

    const currentSuggestionsSystemContent = `The user gives you their image. Your goal is to check if there are any tweaks that could improve the appearance of the user. If there are any suggestions be specific and describe what the user should do in detail. If there are no suggestions describe why the user looks good. Avoid skincare tips.`;

    const suggestionRuns = [
      {
        isMini: true,
        content: [
          {
            type: "image_url" as "image_url",
            image_url: {
              url: await urlToBase64(image),
              detail: "low" as "low",
            },
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
            type: "text" as "text",
            text: `Look at the user's hair texture, skin color, face shape, weight. Is there anything the user can change in their outlook that would make them look better given their features?. If yes, give a detailed step-by-step instructions on what needs to be done and what will be the result. If not, speak about why the user's outlook has nothing to suggest. If something is not clear, don't suggest it. Avoid general tips. Speak about the user's specific features and how your suggestion improves them. Avoid giving a choice, be definite.`,
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 5,
            userId,
          }),
      },
    ];

    const suggestionResponse = await askRepeatedly({
      userId,
      systemContent: currentSuggestionsSystemContent,
      runs: suggestionRuns as RunType[],
      isResultString: true,
      categoryName,
      functionName: "analyzeStyle",
    });

    const formattingSystemContent = `You are given an analysis of the user's appearance, the style reference list used in the analysis and the suggestions for the user on what to change in their appearance. Your goal is to rephrase and format this information in the 2nd tense (you/your) and an engaging language. Format it as a JSON object with the following structure {styleName: the closest style to the user, i.e. the name of the style that the user scored the highest (e.g. rugged, or minimalist, etc), scores: object representing the user's scores for each style of the list in descending order, explanation: your rephrased explanation for each score in the same descending order with the scores, suggestion: your rephrased suggestion on what the user should change}. Use only the information provided. Don't make things up. Think step-by-step.`; // never modify due to fine tuning

    const styleList = outlookStyles.map((style) => style.name).join(", ");

    const FormattedStyleAnalysisResponseType = z.object({
      styleName: z.string(),
      scores: z.object({
        rugged: z.number(),
        athletic: z.number(),
        bohemian: z.number(),
        edgy: z.number(),
        professional: z.number(),
        classic: z.number(),
        minimalist: z.number(),
        casual: z.number(),
      }),
      explanation: z.string(),
      suggestion: z.string(),
    });

    const formattingRuns: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "text" as "text",
            text: `<-->Style list: ${styleList}.<-->Analysis: ${analysis}. <-->Quick fixes feedback: ${suggestionResponse}`,
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "style",
            value: 5,
            userId,
          }),
        model: "ft:gpt-4o-mini-2024-07-18:personal:analyze-style:ArHGsmw2",
        responseFormat: zodResponseFormat(
          FormattedStyleAnalysisResponseType,
          "FormattedStyleAnalysisResponseType"
        ),
      },
    ];

    const { scores, styleName, explanation, suggestion } = await askRepeatedly({
      userId,
      systemContent: formattingSystemContent,
      runs: formattingRuns,
      seed: 481331555,
      categoryName,
      functionName: "analyzeStyle",
    });

    const sortedScores = sortObjectByNumberValue(scores, false);

    return {
      styleName,
      scores: sortedScores,
      explanation,
      suggestion,
    };
  } catch (err) {
    throw httpError(err);
  }
}
