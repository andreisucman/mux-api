import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { convertKeysAndValuesTotoSnakeCase } from "helpers/utils.js";
import incrementProgress from "helpers/incrementProgress.js";
import { UserConcernType, PartEnum, CategoryNameEnum, DemographicsType, ProgressImageType, ScoreType } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { toSentenceCase } from "helpers/utils.js";
import httpError from "helpers/httpError.js";
import { ChatCompletionContentPart } from "openai/resources/index.mjs";

type Props = {
  timeZone: string;
  country: string;
  part: PartEnum;
  userId: string;
  specialConsiderations: string;
  partConcerns: UserConcernType[];
  categoryName: CategoryNameEnum;
  demographics: DemographicsType;
  incrementMultiplier?: number;
  partImages: ProgressImageType[];
  latestProgressFeedback?: string;
  partScores: ScoreType[];
  latestSolutions?: { [key: string]: number };
};

export type ConcernsSolutionsAndFrequenciesType = {
  [key: string]: {
    solution: string;
    monthlyFrequency: number;
    concern?: string;
  }[];
};

export default async function chooseSolutionsForConcerns({
  specialConsiderations,
  partConcerns,
  categoryName,
  latestSolutions,
  incrementMultiplier = 1,
  demographics,
  userId,
  country,
  timeZone,
  partScores,
  latestProgressFeedback,
  part,
}: Props) {
  const callback = () => {
    incrementProgress({
      operationKey: "routine",
      value: 2 * incrementMultiplier,
      userId: String(userId),
    });
  };

  try {
    let findSolutionsInstruction = `You are a dermatologist. You are given the information about a user and a list of their ${part} concerns. Your goal is to come up with a combination of the most effective solutions that you know of that the user can do themselves to improve each of their concerns. Each solution must represent a standalone individual task with a monthly frequency of use. Consider the severity of the concerns when deciding which solutions to recommend. Don't suggest apps, or passive tasks such as sleeping. 
    <--->Your response is an object where keys are the concerns and values are an array of objects each havng a solution name and frequency. <--->Example of your response format: {wrinkles: [{solution: retinol serum, monthlyFrequency: 7}], large_pores: [{solution: chemical exfoliation, monthlyFrequency: 14},{solution: scalp massage, monthlyFrequency: 30}, ...], ...}`;

    if (latestSolutions) {
      findSolutionsInstruction = `You are a dermatologist. You are given the information about a user, a list of their ${part} concerns and the information about the solutons that they have used in the past week to improve the concerns. Your goal is to analyze if their solutions are effective in addressing their concerns and if not, update their list of solutons. You can remove the existing and add new solutions. Each of your suggestions must be a standalone individual task with a monthly frequency of use. Consider the severity of the concerns when deciding which solutions to recommend. Don't suggest apps, or passive tasks such as sleeping. 
    <--->Your response is an object with this structure: {areCurrentSolutionsOkay: true if current solutions are effective at addressing the user's concerns and no changes are needed, updatedListOfSolutions: the updated solutions for each concern if the user's solutions were not effective.} <--->Example of your response format: {areCurrentSolutionsOkay: false, updatedListOfSolutions: {wrinkles: [{solution: retinol serum, monthlyFrequency: 7}], large_pores: [{solution: chemical exfoliation, monthlyFrequency: 14},{solution: scalp massage, monthlyFrequency: 30}, ...], ...}`;
    }

    const findSolutionsContentArray: RunType[] = [];

    const userAboutString = Object.entries({
      ...demographics,
      country,
      timeZone,
    })
      .filter(([key, value]) => Boolean(value))
      .map(([key, value]) => `${toSentenceCase(key)}: ${value}`)
      .join("\n");

    const concernsWithSeverities = partScores
      .filter((so) => so.value > 0)
      .map((so) => `Name: ${so.name}. Severity: ${so.value}/100`)
      .join("\n");

    const content: ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `User info: ${userAboutString}.${
          specialConsiderations ? ` User's special considerations: ${specialConsiderations}` : ""
        }`,
      },
      {
        type: "text",
        text: `User's concerns are: ${concernsWithSeverities}`,
      },
    ];

    if (latestProgressFeedback) {
      content.splice(1, 0, { type: "text", text: latestProgressFeedback });
    }

    findSolutionsContentArray.push({
      model: "deepseek-reasoner",
      content,
      callback,
    });

    let ChooseSolutonForConcernsResponseType = z.object(
      partConcerns.reduce((a, c) => {
        a[c.name] = z
          .array(
            z.object({
              solution: z.string(),
              monthlyFrequency: z.number(),
            })
          )
          .describe(`The array of solutions for the ${c.name} concern`);

        return a;
      }, {})
    );

    if (latestSolutions) {
      ChooseSolutonForConcernsResponseType = z.object({
        areCurrentSolutionsOkay: z
          .boolean()
          .describe("true if the current solutions are effective and no more solutions are needed, false otherwise"),
        updatedListOfSolutions: z.object(
          partConcerns.reduce((a, c) => {
            a[c.name] = z
              .array(
                z.object({
                  solution: z.string(),
                  monthlyFrequency: z.number(),
                })
              )
              .describe(`The array of solutions for the ${c.name} concern`);

            return a;
          }, {})
        ),
      });
    }

    let text =
      "Does your list have any non-atomic tasks such as 'use retinol and moisturize'? If yes, break them down into specific tasks, such as 'use retinol', 'moisturize' etc. ";

    const checkMessage: RunType = {
      model: "o3-mini",
      content: [
        {
          type: "text",
          text,
        },
      ],
      callback,
      responseFormat: zodResponseFormat(ChooseSolutonForConcernsResponseType, "ChooseSolutonForConcernsResponseType"),
    };

    findSolutionsContentArray.push(checkMessage);

    let findFrequencyResponse: ConcernsSolutionsAndFrequenciesType = await askRepeatedly({
      userId: String(userId),
      categoryName,
      systemContent: findSolutionsInstruction,
      runs: findSolutionsContentArray as RunType[],
      functionName: "chooseSolutionsForConcerns",
    });

    let data = findFrequencyResponse;

    if (latestSolutions) {
      data = findFrequencyResponse.updatedListOfSolutions as unknown as ConcernsSolutionsAndFrequenciesType;
    }

    data = Object.fromEntries(
      Object.entries(data).map(([concern, arrayOfObjects]) => [
        concern,
        arrayOfObjects.map((ob) => {
          ob.concern = concern;
          return ob;
        }),
      ])
    );

    data = convertKeysAndValuesTotoSnakeCase(data);

    if (latestSolutions) {
      const { areCurrentSolutionsOkay } = findFrequencyResponse;
      return { areCurrentSolutionsOkay, updatedListOfSolutions: data };
    }

    return {
      areCurrentSolutionsOkay: null,
      updatedListOfSolutions: data,
    };
  } catch (error) {
    throw httpError(error);
  }
}
