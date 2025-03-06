import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import {
  convertKeysAndValuesTotoSnakeCase,
  urlToBase64,
} from "helpers/utils.js";
import incrementProgress from "helpers/incrementProgress.js";
import {
  UserConcernType,
  AllTaskType,
  PartEnum,
  CategoryNameEnum,
  DemographicsType,
  ProgressImageType,
} from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CreateRoutineAllSolutionsType } from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

type Props = {
  part: PartEnum;
  userId: string;
  specialConsiderations: string;
  allSolutions: CreateRoutineAllSolutionsType[];
  partConcerns: UserConcernType[];
  partImages: ProgressImageType[];
  categoryName: CategoryNameEnum;
  demographics: DemographicsType;
  incrementMultiplier?: number;
};

export default async function getSolutionsAndFrequencies({
  specialConsiderations,
  allSolutions,
  partConcerns,
  categoryName,
  partImages,
  incrementMultiplier = 1,
  demographics,
  userId,
  part,
}: Props) {
  const { sex } = demographics;

  const concernsNames = partConcerns.map((c) => c.name);

  const checkFacialHair =
    sex === "male" &&
    part === "face" &&
    concernsNames.includes("ungroomed_facial_hair");

  try {
    const callback = () =>
      incrementProgress({
        operationKey: "routine",
        value: 1 * incrementMultiplier,
        userId: String(userId),
      });

    const relevantImage = partImages.find((imo) => imo.position === "front");

    const facialHairCheck: RunType = {
      isMini: true,
      content: [
        {
          type: "text",
          text: `Does it appear like the user is growing beard or moustache? If yes, don't suggest a clean shave.`,
        },
        {
          type: "image_url",
          image_url: {
            url: await urlToBase64(relevantImage.mainUrl.url),
            detail: "low",
          },
        },
      ],
      callback,
    };

    const allSolutionsList = allSolutions.map((obj) => obj.key).join(", ");

    let findSolutionsInstruction = `You are a dermatologist, dentist and fitness coach. The user gives you a list of their concerns. Your goal is to select the most effective combination of solutions for each of their concerns from this list of solutions: ${allSolutionsList}. DON'T MODIFY THE NAMES OF THE CONCERNS AND SOLUTIONS. Be concise and to the point.`;

    const allConcerns = partConcerns.map((co) => co.name);

    const findSolutionsContentArray: RunType[] = [];

    findSolutionsContentArray.push(
      {
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `My concerns are: ${allConcerns.join(", ")}`,
          },
        ],
        callback,
      },
      {
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `Among your proposed combination are there any solutions that require resting time such that the other solutions can't be used within the same week? If yes, remove the least effective conflicting solutions.`,
          },
        ],
        callback,
      }
    );

    if (part === "body") {
      findSolutionsContentArray.push({
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: "Have you included enough exercises for the whole month according to the push-pull-legs workout type? The user will be working out 3 days per week.",
          },
        ],
        callback,
      });
    }

    if (specialConsiderations) {
      findSolutionsContentArray.push({
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `The user has this special consideration: ${specialConsiderations}. Is it contraindicated for any of the solutions? If yes, remove those solutions.`,
          },
        ],
        callback,
      });
    }

    if (checkFacialHair) {
      findSolutionsContentArray.push(facialHairCheck);
    }

    const findSolutionsResponseMap = allConcerns.reduce(
      (a: { [key: string]: any }, c) => {
        a[c] = z
          .array(
            z
              .string()
              .describe(
                `name of a solution for concern ${c} from the list of solution`
              )
          )
          .describe(`list of solutions for concern ${c}`);
        return a;
      },
      {}
    );

    const FindSolutionsResponseType = z
      .object(findSolutionsResponseMap)
      .describe("concern:solutions[] map");

    findSolutionsContentArray.push({
      isMini: true,
      content: [
        {
          type: "text",
          text: `Are all solution names written exactly as in the list? Ensure that all are written exactly as in the list.`,
        },
      ],
      responseFormat: zodResponseFormat(
        FindSolutionsResponseType,
        "FindSolutionsResponseType"
      ),
      callback,
    });

    const findSolutionsResponse: { [key: string]: string } =
      await askRepeatedly({
        userId: String(userId),
        categoryName,
        systemContent: findSolutionsInstruction,
        runs: findSolutionsContentArray as RunType[],
        functionName: "getSolutionsAndFrequencies",
      });

    /* come up with frequencies for the solutions */
    const findFrequenciesInstruction = `You are a dermatologist, dentist and fitness coach. You are given the concerns of the user and solutions that they are going to use to improve them. Your goal is to tell how many times each solution should be used in a month to most effectively improve their concern based on their image. YOUR RESPONSE IS A TOTAL NUMBER OF APPLICATIONS IN A MONTH, NOT DAY OR WEEK. DON'T MODIFY THE NAMES OF CONCERNS AND SOLUTIONS. Think step-by-step.`;

    const userImages = [];

    for (const partImo of partImages) {
      userImages.push({
        type: "image_url" as "image_url",
        image_url: {
          url: await urlToBase64(partImo.mainUrl.url),
          detail: "low" as "low",
        },
      });
    }

    const findFrequenciesContentArray: RunType[] = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `The user has these concerns and plans to use the solutions in square brackets to improve them: ${JSON.stringify(
              findSolutionsResponse
            )}. What would be the best usage frequency for each solution?`,
          },
          {
            type: "text",
            text: "Here are the images for your reference:",
          },
          ...userImages,
        ],
        callback,
      },
    ];

    if (specialConsiderations) {
      findFrequenciesContentArray.push({
        isMini: false,
        content: [
          {
            type: "text",
            text: `The user has the following condition: ${specialConsiderations}. Does it change the frequencies? If yes change the frequencies, if not leave as is.`,
          },
        ],
        callback,
      });
    }

    const solutionsList = Object.values(findSolutionsResponse).flat();

    const findFrequenciesInstructionMap = solutionsList.reduce(
      (a: { [key: string]: any }, c) => {
        a[c] = z
          .number()
          .describe("number of times in a MONTH this solution should be used");
        return a;
      },
      {}
    );

    const FindFrequenciesInstructionResponse = z
      .object(findFrequenciesInstructionMap)
      .describe("solution:monthlyFrequency map");

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
        findFrequenciesContentArray.push({
          isMini: false,
          content: [
            {
              type: "text" as "text",
              text: `The user is ${condition} and they want to ${wish} as fast as possible. Should the frequencies of the solutions be changed to account for that? If yes, change them, if not leave as is. Check each solution.`,
            },
          ],
          callback,
        });
    }

    const lastMessage =
      findFrequenciesContentArray[findFrequenciesContentArray.length - 1];

    lastMessage.responseFormat = zodResponseFormat(
      FindFrequenciesInstructionResponse,
      "FindFrequenciesInstructionResponse"
    );

    let findFrequencyResponse: { [key: string]: ScheduleTaskType[] } =
      await askRepeatedly({
        userId: String(userId),
        categoryName,
        systemContent: findFrequenciesInstruction,
        runs: findFrequenciesContentArray as RunType[],
        functionName: "getSolutionsAndFrequencies",
      });

    findFrequencyResponse = convertKeysAndValuesTotoSnakeCase(
      findFrequencyResponse
    );

    /* change names of solutions to snake case */
    const valuesWithConcerns: AllTaskType[] = [];

    const keysOfSolutions = Object.keys(findFrequencyResponse);

    const entriesOfConcerns = Object.entries(findSolutionsResponse);
    const namesOfConcerns = entriesOfConcerns.map((entry) =>
      entry[0].toLowerCase()
    );

    const concernSolutions = entriesOfConcerns.map((entry) => entry[1]);

    for (const key of keysOfSolutions) {
      const relevantSolution = allSolutions.find((s) => s.key === key);

      if (!relevantSolution) continue;

      const { name, icon, color, description, instruction } = relevantSolution;

      const total = Math.max(
        Math.round(Number(findFrequencyResponse[key]) / 4.285714301020408), // needed to turn monthly frequency into weekly
        1
      );

      const record: AllTaskType = {
        name,
        key,
        icon,
        color,
        description,
        instruction,
        concern: null,
        completed: 0,
        unknown: 0,
        total,
      };

      const indexOfConcern = concernSolutions.findIndex((arrayOfSolutions) =>
        arrayOfSolutions.includes(key)
      );

      record.concern = namesOfConcerns[indexOfConcern].toLowerCase();
      valuesWithConcerns.push(record);
    }

    return valuesWithConcerns.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    throw httpError(error);
  }
}
