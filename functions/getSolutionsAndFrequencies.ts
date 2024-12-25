import askRepeatedly from "functions/askRepeatedly.js";
import { convertKeysAndValuesTotoSnakeCase } from "helpers/utils.js";
import { combineSolutions } from "helpers/utils.js";
import incrementProgress from "helpers/incrementProgress.js";
import {
  UserConcernType,
  AllTaskType,
  TypeEnum,
  UserInfoType,
  PartEnum,
  CategoryNameEnum
} from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CreateRoutineAllSolutionsType } from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";

type Props = {
  specialConsiderations: string;
  allSolutions: CreateRoutineAllSolutionsType[];
  concerns: UserConcernType[];
  type: TypeEnum;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  userInfo: UserInfoType;
};

export default async function getSolutionsAndFrequencies({
  specialConsiderations,
  allSolutions,
  concerns,
  categoryName,
  type,
  part,
  userInfo,
}: Props) {
  const { demographics, _id: userId } = userInfo;
  const { sex } = demographics;

  const dontSuggestCleanShave =
    sex === "male" &&
    type === "head" &&
    concerns.map((c) => c.name).includes("ungroomed_facial_hair");

  try {
    const callback = () =>
      incrementProgress({
        operationKey: type,
        increment: 1,
        userId: String(userId),
      });

    const allSolutionsList = allSolutions.map((obj) => obj.key);

    const findSolutionsInstruction = `You are a ${
      type === "head" ? "dermatologist and dentist" : "fitness coach"
    }. The user gives you a list of their concerns ${
      specialConsiderations ? ", tells their special requirements" : ""
    }. Your goal is to select the single most effective solution for each of their concerns from this list of solutions: ${allSolutionsList.join(
      ", "
    )}. ${
      specialConsiderations
        ? "Consider the following special requirement of the user when choosing the solutions" +
          specialConsiderations
        : ""
    }. ALL NAMES FORMAT MUST BE EXACTLY AS IN THE LIST. Be concise and to the point.`;

    const allConcerns = concerns.map(
      (concern, index) =>
        `${index + 1}: ${concern.name}. Details: ${concern.explanation} ##`
    );

    const findSolutionsContentArray = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `My concerns are: ${allConcerns.join(", ")}`,
          },
        ],
        callback,
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Are there any more appropriate (effective) solutions for each concern in the list or not?`,
          },
        ],
        callback,
      },
    ];

    if (dontSuggestCleanShave) {
      findSolutionsContentArray.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `Does the person have a beard or moustache? If yes, don't suggest a clean shave.`,
          },
        ],
        callback,
      });
    }

    findSolutionsContentArray.push(
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Are all names written exactly as in the lists? If not, make all names exactly as in the lists.`,
          },
        ],
        callback,
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Format your latest suggestion as a JSON object with this schema: {name of the concern: name of the solution}.`,
          },
        ],
        callback,
      }
    );

    const findSolutionsResponse = await askRepeatedly({
      userId: String(userId),
      categoryName,
      systemContent: findSolutionsInstruction,
      runs: findSolutionsContentArray as RunType[],
      functionName: "getSolutionsAndFrequencies",
    });

    /* get additional solutions */
    const findAdditionalSolutionsInstruction = `What solutions from this list: ${allSolutionsList.join(
      ", "
    )} would increase the effectiveness or comfort of these solutions: ${JSON.stringify(
      findSolutionsResponse
    )}? ${
      specialConsiderations
        ? "Consider the following special requirement of the user when choosing the solutions" +
          specialConsiderations
        : ""
    }. ALL NAMES FORMAT EXACTLY AS IN THE LIST. Think step-by-step. Be concise and to the point.`;

    const findAdditionalSolutionsContentArray = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Does the list have any supportive solutions that are typically used with the main solutions? If yes add up to 3 supportive solutions.`,
          },
        ],
        callback,
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Are there solutions that contradict each other or are contraindicated? If yes, remove the least relevant contradicting solutions.`,
          },
        ],
        callback,
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Are there solutions that are very similar to each other such that using them together could be detrimental or just too much? If yes, remove the redundant ones.`,
          },
        ],
        callback,
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Look at your latest list of solutions. Remove those that are not related to these concerns: ${JSON.stringify(
              allConcerns
            )}`,
          },
        ],
        callback,
      },
    ];

    if (dontSuggestCleanShave) {
      findAdditionalSolutionsContentArray.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `From the concerns description, does the person have a beard or moustache? If yes, don't suggest a clean shave.`,
          },
        ],
        callback,
      });
    }

    if (specialConsiderations) {
      findAdditionalSolutionsContentArray.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `Are there any solutions that contradict this special consideration: ${specialConsiderations}. If yes, remove or replace them with the appropriate ones.`,
          },
        ],
        callback,
      });
    }

    findAdditionalSolutionsContentArray.push({
      isMini: true,
      content: [
        {
          type: "text",
          text: `Are all the names in your latest suggestions written exaclty as in the lists? If not, rewrite them exactly as in the lists.`,
        },
      ],
      callback,
    });

    findAdditionalSolutionsContentArray.push({
      isMini: true,
      content: [
        {
          type: "text",
          text: `Format your latest suggestion as a JSON object with this schema: {name of the existing solution: [name of the complementary solution, name of the complementary solution, ... ]}.`,
        },
      ],
      callback,
    });

    const findAdditionalSolutionsResponse = await askRepeatedly({
      userId: String(userId),
      categoryName,
      systemContent: findAdditionalSolutionsInstruction,
      runs: findAdditionalSolutionsContentArray as RunType[],
      functionName: "getSolutionsAndFrequencies",
    });

    let updatedConcernsSolutionsMap = combineSolutions(
      findSolutionsResponse,
      findAdditionalSolutionsResponse
    );

    updatedConcernsSolutionsMap = convertKeysAndValuesTotoSnakeCase(
      updatedConcernsSolutionsMap
    );

    /* come up with frequencies for the solutions */
    const findFrequenciesInstruction = `You are a ${
      type === "head" ? "dermatologist and dentist" : "fitness coach"
    }. The user gives you a list of solutions they are going to use ${
      specialConsiderations ? ", tells their special requirements" : ""
    }. Your goal is to tell how many times in a month each solution should be done. ${
      specialConsiderations
        ? "Consider the following special requirement of the user when deciding on the frequency." +
          specialConsiderations
        : ""
    }. Think step-by-step. Be concise and to the point. YOUR RESPONSE IS A TOTAL NUMBER OF APPLICATIONS IN A MONTH NOT DAY OR WEEK.`;

    const stringOfSolutions = Object.values(updatedConcernsSolutionsMap)
      .flat()
      .join(", ");

    const findFrequenciesContentArray = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `I'm going to apply these solutions: ${stringOfSolutions}. What would be the best application frequency for each solution?`,
          },
        ],
        callback,
      },
    ];

    if (type === "head") {
      findFrequenciesContentArray.push(
        {
          isMini: false,
          content: [
            {
              type: "text",
              text: `Do you think the frequencies should be modified for better effectiveness? If yes, modify them, if not leave as is.`,
            },
          ],
          callback,
        },
        {
          isMini: false,
          content: [
            {
              type: "text",
              text: `Look at each solution again, are you sure that your frequency is not too much? If it's too much modify it, if not, leave as is.`,
            },
          ],
          callback,
        }
      );
    }

    if (type === "body") {
      findFrequenciesContentArray.push({
        isMini: false,
        content: [
          {
            type: "text",
            text: `My general approach is to train each muscle groop 2 times a week. Do you think the frequencies should be modified for achieving that? If yes, modify them. if not leave as is.`,
          },
        ],
        callback,
      });
    }

    findFrequenciesContentArray.push(
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Can you confirm that each frequency is represented as a total number of applications for a month? If not, make each frequency a single total number for a month.`,
          },
        ],
        callback,
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Format your latest suggestions as a JSON object with this schema: {name of the solution: number of times it should be done in a month}.`,
          },
        ],
        callback,
      }
    );

    let findFrequencyResponse = await askRepeatedly({
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

    const entriesOfConcerns = Object.entries(updatedConcernsSolutionsMap);
    const namesOfConcerns = entriesOfConcerns.map((entry) =>
      entry[0].toLowerCase()
    );

    const concernSolutions = entriesOfConcerns.map((entry) => entry[1]);

    for (const key of keysOfSolutions) {
      const relevantSolution = allSolutions.find((s) => s.key === key);
      const { name, icon, color, description, instruction } = relevantSolution;

      const total = Math.max(
        Math.round(Number(findFrequencyResponse[key]) / 4.285714301020408), // needed to turn monthly frequency into weekly
        1
      );

      const record: AllTaskType = {
        name,
        icon,
        color,
        part,
        description,
        instruction,
        concern: null,
        completed: 0,
        unknown: 0,
        key: key,
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
