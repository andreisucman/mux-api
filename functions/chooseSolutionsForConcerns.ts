import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { convertKeysAndValuesTotoSnakeCase } from "helpers/utils.js";
import incrementProgress from "helpers/incrementProgress.js";
import {
  UserConcernType,
  PartEnum,
  CategoryNameEnum,
  DemographicsType,
  ProgressImageType,
} from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import checkFacialHair from "./checkFacialHair.js";
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
  currentSolutions?: { [key: string]: number };
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
  currentSolutions,
  incrementMultiplier = 1,
  partImages,
  demographics,
  userId,
  country,
  timeZone,
  latestProgressFeedback,
  part,
}: Props) {
  const callback = () => {
    const value = part === "body" ? 7 : 14;
    incrementProgress({
      operationKey: "routine",
      value: value * incrementMultiplier,
      userId: String(userId),
    });
  };

  const { sex } = demographics;

  const concernsNames = partConcerns.map((c) => c.name);

  try {
    const shouldCheckFacialHar =
      sex === "male" &&
      part === "face" &&
      concernsNames.includes("ungroomed_facial_hair");

    let findSolutionsInstruction = `You are a dermatologist, dentist and fitness coach. You are given the information about a user and a list of their ${part} concerns. Your goal is to come up with a combination of the most effective solutions that you know of that the user can do themselves to improve each of their concerns. These could include nutrition, skincare or fitness tasks. Each solution must represent a standalone individual task with a monthly frequency of use. The solutions must be compatible with each other. Don't suggest apps, or passive tasks such as sleeping. 
    <--->Your response is an object where keys are the concerns and values are an array of objects each havng a solution name and frequency. <--->Example of your response format: {chapped_lips: [{solution: lip healing balm, monthlyFrequency: 60}], thinning_hair: [{solution: minoxidil, monthlyFrequency: 60},{solution: scalp massage, monthlyFrequency: 30}, {solution: gentle shampoo, monthlyFrequency: 8}, ...], ...}`;

    if (currentSolutions) {
      findSolutionsInstruction = `You are a dermatologist, dentist and fitness coach. You are given the information about a user, a list of their ${part} concerns and the information about the solutons that they have used in the past week to improve the concerns. Your goal is to analyze if their solutions are effective in addressing their concerns and if not, update their list of solutons. You can remove the existing and add new solutions. Your suggestions could include nutrition, skincare or fitness tasks. Each of your suggestions must be a standalone individual task with a monthly frequency of use. Don't suggest apps, or passive tasks such as sleeping. 
    <--->Your response is an object with this structure: {areCurrentSolutionsOkay: true if current solutions are effective at addressing the user's concerns and no changes are needed, updatedListOfSolutions: the updated solutions for each concern if the user's solutions were not effective.} <--->Example of your response format: {areCurrentSolutionsOkay: false, updatedListOfSolutions: {chapped_lips: [{solution: lip healing balm, monthlyFrequency: 60}], thinning_hair: [{solution: minoxidil, monthlyFrequency: 60},{solution: scalp massage, monthlyFrequency: 30}, {solution: gentle shampoo, monthlyFrequency: 8}, ...], ...}}`;
    }

    if (shouldCheckFacialHar) {
      const growsFacialHair = await checkFacialHair({
        categoryName,
        partImages,
        userId,
        incrementMultiplier,
      });

      if (growsFacialHair)
        findSolutionsInstruction += ` Don't suggest clean shave.`;
    }

    const allConcerns = partConcerns.map((co) => ({
      name: co.name,
      importance: co.importance,
    }));

    const findSolutionsContentArray: RunType[] = [];

    const userAboutString = Object.entries({
      ...demographics,
      country,
      timeZone,
    })
      .filter(([key, value]) => Boolean(value))
      .map(([key, value]) => `${toSentenceCase(key)}: ${value}`)
      .join("\n");

    const content: ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `User info: ${userAboutString}.${
          specialConsiderations
            ? ` User's special considerations: ${specialConsiderations}`
            : ""
        }`,
      },
      {
        type: "text",
        text: `User's concerns are: ${JSON.stringify(allConcerns)}`,
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

    let text =
      "1) Does your final list inclue enough tasks for each concern? Your list should have all of the necessary tasks that can improve the concerns on their own assuming that the user is not going to do anything else besides them. 2) If your list has any collective tasks such as 'maintain calorie surplus', break them down into specific tasks, such as 'eat xyz meal' or 'drink zyx drink' etc. 3) Ensure that the tasks you suggest are not too exotic, dangerous or extremely difficult to do correctly for the user based on the user's info.";

    if (part === "body") {
      const isOverweight = concernsNames.includes("excess_weight");
      const isUnderweight = concernsNames.includes("low_body_mass");

      if (isUnderweight) {
        text += ` 4) Assume that it's hard for the user to gain weight. Should the tasks or their frequencies be changed? if yes change, if not, leave as is.`;
      }

      if (isOverweight) {
        text += ` 4) Assume that it's hard for the user to lose weight. Should the tasks or their frequencies be changed? if yes change, if not, leave as is.`;
      }
    }

    const checkMessage: RunType = {
      model: "deepseek-reasoner",
      content: [
        {
          type: "text",
          text,
        },
      ],
      callback,
    };

    findSolutionsContentArray.push(checkMessage);

    let ChooseSolutonForConcernsResponseType = z.object(
      allConcerns.reduce((a, c) => {
        a[c.name] = z
          .array(
            z.object({ solution: z.string(), monthlyFrequency: z.number() })
          )
          .describe(`The array of solutions for the ${c.name} concern`);

        return a;
      }, {})
    );

    if (currentSolutions) {
      ChooseSolutonForConcernsResponseType = z.object({
        areCurrentSolutionsOkay: z
          .boolean()
          .describe(
            "true if the current solutions are effective and no more solutions are needed, false otherwise"
          ),
        updatedListOfSolutions: z.object(
          allConcerns.reduce((a, c) => {
            a[c.name] = z
              .array(
                z.object({ solution: z.string(), monthlyFrequency: z.number() })
              )
              .describe(`The array of solutions for the ${c.name} concern`);

            return a;
          }, {})
        ),
      });
    }

    findSolutionsContentArray.push({
      model: "gpt-4o-mini",
      content: [
        {
          type: "text",
          text: `Format your final list of solutions as JSON object.`,
        },
      ],
      responseFormat: zodResponseFormat(
        ChooseSolutonForConcernsResponseType,
        "ChooseSolutonForConcernsResponseType"
      ),
      callback,
    });

    let findFrequencyResponse: ConcernsSolutionsAndFrequenciesType =
      await askRepeatedly({
        userId: String(userId),
        categoryName,
        systemContent: findSolutionsInstruction,
        runs: findSolutionsContentArray as RunType[],
        functionName: "chooseSolutionsForConcerns",
      });

    let data = findFrequencyResponse;

    if (currentSolutions) {
      data =
        findFrequencyResponse.updatedListOfSolutions as unknown as ConcernsSolutionsAndFrequenciesType;
    }

    data = Object.fromEntries(
      Object.entries(findFrequencyResponse).map(([concern, arrayOfObjects]) => [
        concern,
        arrayOfObjects.map((ob) => {
          ob.concern = concern;
          return ob;
        }),
      ])
    );

    data = convertKeysAndValuesTotoSnakeCase(findFrequencyResponse);

    if (currentSolutions) {
      const { areCurrentSolutionsOkay } = findFrequencyResponse;

      return { areCurrentSolutionsOkay, concernsSolutionsAndFrequencies: data };
    }

    return {
      areCurrentSolutionsOkay: null,
      updatedListOfSolutions: data,
    };
  } catch (error) {
    throw httpError(error);
  }
}
