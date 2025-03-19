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
  part,
}: Props) {
  const callback = () =>
    incrementProgress({
      operationKey: "routine",
      value: 1 * incrementMultiplier,
      userId: String(userId),
    });

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
      findSolutionsInstruction = `You are a dermatologist, dentist and fitness coach. You are given the information about a user, a list of their ${part} concerns and the current solutons that they are using to improve the concerns. Your goal is to check if the number and frequency of their solutions are optimal for addressing the concerns and if not, suggest additional solutions. The additional solutions could include nutrition, skincare or fitness tasks. Each solution must represent a standalone individual task with a monthly frequency of use. The solutions must be compatible with the existing solutions. Don't suggest using apps, or passive tasks such as sleeping. 
    <--->Your response is an object with this structure: {areEnough: true if current solutions are enough, false if not, additionalSolutions: an object of additional solutions if required, each having a solution name and frequency, or null if no additional solutions are needed.} <--->Example of your response format: {areEnough: false, additionalSolutions: {chapped_lips: [{solution: lip healing balm, monthlyFrequency: 60}], thinning_hair: [{solution: minoxidil, monthlyFrequency: 60},{solution: scalp massage, monthlyFrequency: 30}, {solution: gentle shampoo, monthlyFrequency: 8}, ...], ...}}`;
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

    findSolutionsContentArray.push(
      {
        model: "deepseek-reasoner",
        content: [
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
            text: `The user's concerns are: ${JSON.stringify(allConcerns)}`,
          },
        ],
        callback,
      },
      {
        model: "deepseek-reasoner",
        content: [
          {
            type: "text",
            text: "1) Have you suggested enough tasks for each concern? Your list should have all of the necessary tasks that can improve the concerns on their own assuming that the user is not going to do anything else besides them. 2) If you added any collective tasks such as 'maintain calorie surplus', break them down into specific tasks, such as 'eat xyz meal' or 'drink zyx drink' etc. 3) Ensure that the tasks you suggest are not too exotic, dangerous or extremely difficult to do correctly for the average user.",
          },
        ],
        callback,
      }
    );

    if (part === "body") {
      const isOverweight = concernsNames.includes("excess_weight");
      const isUnderweight = concernsNames.includes("low_body_mass");

      const condition = isOverweight
        ? "overweight"
        : isUnderweight
        ? "underweight"
        : undefined;

      const wish = isOverweight
        ? "lose weight"
        : isUnderweight
        ? "gain mass"
        : undefined;

      if (condition && wish)
        findSolutionsContentArray.push({
          model: "deepseek-reasoner",
          content: [
            {
              type: "text" as "text",
              text: `Have you considered that the user is ${condition} and they want to ${wish}? If not, should the frequencies of the solutions be changed to best satisfy their wish safely? If yes, change them, if not leave as is.`,
            },
          ],
          callback,
        });
    }

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
        areEnough: z
          .boolean()
          .describe(
            "true if the current tasks are enought and no more solutions are needed, false otherwise"
          ),
        additionalSolutions: z.object(
          allConcerns.reduce((a, c) => {
            a[c.name] = z
              .array(
                z.object({ solution: z.string(), monthlyFrequency: z.number() })
              )
              .describe(
                `The array of the adtional solutions for the ${c.name} concern`
              );

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
        findFrequencyResponse.additionalSolutions as unknown as ConcernsSolutionsAndFrequenciesType;
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
      const { areEnough } = findFrequencyResponse;

      return { areEnough, concernsSolutionsAndFrequencies: data };
    }

    return { areEnough: null, concernsSolutionsAndFrequencies: data };
  } catch (error) {
    throw httpError(error);
  }
}
