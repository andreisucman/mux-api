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
  TypeEnum,
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
  type: TypeEnum;
  part: PartEnum;
  userId: string;
  specialConsiderations: string;
  allSolutions: CreateRoutineAllSolutionsType[];
  partConcerns: UserConcernType[];
  partImages: ProgressImageType[];
  categoryName: CategoryNameEnum;
  demographics: DemographicsType;
};

export default async function getSolutionsAndFrequencies({
  specialConsiderations,
  allSolutions,
  partConcerns,
  categoryName,
  partImages,
  demographics,
  userId,
  type,
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
        operationKey: type,
        increment: 1,
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

    const allSolutionsList = allSolutions.map((obj) => obj.key);

    const findSolutionsInstruction = `You are a ${
      type === "head" ? "dermatologist and dentist" : "fitness coach"
    }. The user gives you a list of their concerns. Your goal is to select all solutions for each of their concerns from this list of solutions: ${allSolutionsList.join(
      ", "
    )}. DON'T MODIFY THE NAMES OF CONCERNS AND SOLUTIONS. Be concise and to the point.`;

    const allConcerns = partConcerns.map((co) => co.name);
    const concernsWithExplanations = partConcerns.map(
      (concern, index) =>
        `${index + 1}: ${concern.name}. Details: ${concern.explanation} ##`
    );

    const findSolutionsContentArray: RunType[] = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `My concerns are: ${concernsWithExplanations.join(", ")}`,
          },
        ],

        callback,
      },
    ];

    if (checkFacialHair) {
      findSolutionsContentArray.push(facialHairCheck);
    }

    if (specialConsiderations) {
      findSolutionsContentArray.push({
        isMini: false,
        content: [
          {
            type: "text",
            text: `The user has this special consideration: ${specialConsiderations}. Is it contraindicated for any of the solutions? If yes, remove those solutions.`,
          },
        ],

        callback,
      });
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
    const findFrequenciesInstruction = `You are a ${
      type === "head" ? "dermatologist and dentist" : "fitness coach"
    }. The user tells you their concerns and solutions that they are going to use to improve them. Your goal is to tell how many times each solution should be used in a month to most effectively improve their concern based on their image. YOUR RESPONSE IS A TOTAL NUMBER OF APPLICATIONS IN A MONTH, NOT DAY OR WEEK. DON'T MODIFY THE NAMES OF CONCERNS AND SOLUTIONS.`;

    const images = [];

    for (const partImo of partImages) {
      images.push({
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
            text: `I want to combat these concerns and plan to use the solutions in square brackets to do that: ${JSON.stringify(
              findSolutionsResponse
            )}. What would be the best usage frequency for each solution?`,
          },
          {
            type: "text",
            text: "Here are the images of my concerns for your reference:",
          },
          ...images,
        ],
        callback,
      },
    ];

    if (specialConsiderations) {
      findFrequenciesContentArray.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `I have the following condition: ${specialConsiderations}. Does it change the frequencies? If yes change the frequencies, if not leave as is.`,
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

    findFrequenciesContentArray.push({
      isMini: false,
      content: [
        {
          type: "text" as "text",
          text: `Do you think the frequencies should be modified for better effectiveness? If yes, modify them, if not leave as is.`,
        },
      ],
      responseFormat: zodResponseFormat(
        FindFrequenciesInstructionResponse,
        "FindFrequenciesInstructionResponse"
      ),
      callback,
    });

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

    return valuesWithConcerns;
  } catch (error) {
    throw httpError(error);
  }
}
