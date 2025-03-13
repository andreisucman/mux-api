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

    let findSolutionsInstruction = `You are a dermatologist, dentist and fitness coach. You are given the information about a user and a list of their ${part} concerns. Your goal is to come up with a combination of the most effective solutions that you know of that the user can do themselves to improve each of their concerns. These could include nutrition, skincare or fitness tasks. Each solution should have a monthly frequency of use and be compatible with the rest of the solutions that you suggest. 
     <--->Example of your response format: Concern: chapped_lips.\n\n Solutions for chapped lips:\n -lip healing balm, monthlyFrequency: 60\n\n Concern: thinning_hair. Solutions for thinning hair:\n -minoxidil, monthlyFrequency: 60\n -scalp massage, monthlyFrequency: 30\n -gentle shampoo, monthlyFrequency: 8.`;

    if (currentSolutions) {
      findSolutionsInstruction = `You are a dermatologist, dentist and fitness coach. You are given the information about a user, a list of their ${part} concerns and the current solutons that they are using to improve the concerns. Your goal is to check if the number and frequency of their solutions are optimal for addressing the concerns and if not, suggest additional solutions. The additional solutions could include nutrition, skincare or fitness tasks. Each solution should have a monthly frequency of use and be compatible with the exsting solutions. 
    <--->Your response is an object with this structure: {areEnough: true if current solutions are enough, false if not, additionalSolutions: an object of additional solutions if required, each having a solution name and frequency, or null if no additional solutions are needed.} <--->Example of your response format: The current solution are not enough.\n The additional solutions are: Concern: chapped_lips.\n\nSolutions for chapped lips:\n -lip healing balm, monthlyFrequency: 60\n\nConcern: thinning_hair. Solutions for thinning hair:\n -minoxidil, monthlyFrequency: 60\n -scalp massage, monthlyFrequency: 30\n -gentle shampoo, monthlyFrequency: 8.`;
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

    const usersConcerns = partConcerns.map((co) => ({
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

    const usersConcernsString = usersConcerns
      .map((o) => `Concern: ${o.name}, Importance: ${o.importance}`)
      .join("\n\n");

    findSolutionsContentArray.push({
      model: "o3-mini",
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
          text: `The user's concerns are:\n${usersConcernsString}`,
        },
      ],
      callback,
    });

    findSolutionsContentArray.push({
      model: "o3-mini",
      content: [
        {
          type: "text",
          text: `Ensure that all of your tasks are related to ${part}. Your list should only contain tasks that are effective at resolving the specific concern on the ${part} specifically.`,
        },
        {
          type: "text",
          text: `Ensure that your solutions can easily be sourced, or performed in the user's geography. Your suggestions shouldn't feel exotic for the user. You can get an idea of their geography from their timeZone or country if available.`,
        },
      ],
      callback,
    });

    findSolutionsContentArray.push({
      model: "o3-mini",
      content: [
        {
          type: "text",
          text: `Have you considered the user's demographic factors such as age or ethnicity? Think if they influence the solutions or their frequency and if yes, modify accordingly, if not leave as is.`,
        },
      ],
      callback,
    });

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
          model: "o3-mini",
          content: [
            {
              type: "text" as "text",
              text: `Have you considered that the user is ${condition} and they want to ${wish} as fast as possible? If not, should the frequencies of the solutions be changed to best satisfy their wish safely? If yes, change them, if not leave as is.`,
            },
          ],
          callback,
        });
    }

    let ChooseSolutonForConcernsResponseType = z.object(
      usersConcerns.reduce((a, c) => {
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
          usersConcerns.reduce((a, c) => {
            a[c.name] = z
              .array(
                z.object({ solution: z.string(), monthlyFrequency: z.number() })
              )
              .describe(
                `the array of the adtional solutions for the ${c.name} concern`
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
          text: `format your final list of solutions as a JSON object.`,
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

    if (currentSolutions) {
      findFrequencyResponse =
        findFrequencyResponse.additionalSolutions as unknown as ConcernsSolutionsAndFrequenciesType;
    }

    findFrequencyResponse = Object.fromEntries(
      Object.entries(findFrequencyResponse).map(([concern, arrayOfObjects]) => [
        concern,
        arrayOfObjects.map((ob) => {
          ob.concern = concern;
          return ob;
        }),
      ])
    );

    findFrequencyResponse = convertKeysAndValuesTotoSnakeCase(
      findFrequencyResponse
    );

    if (currentSolutions) {
      const { areEnough } = findFrequencyResponse;

      return {
        areEnough,
        concernsSolutionsAndFrequencies: findFrequencyResponse,
      };
    }

    return {
      areEnough: false,
      concernsSolutionsAndFrequencies: findFrequencyResponse,
    };
  } catch (error) {
    throw httpError(error);
  }
}
