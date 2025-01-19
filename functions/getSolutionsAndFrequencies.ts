import askRepeatedly from "functions/askRepeatedly.js";
import { convertKeysAndValuesTotoSnakeCase } from "helpers/utils.js";
import { combineSolutions } from "helpers/utils.js";
import incrementProgress from "helpers/incrementProgress.js";
import {
  UserConcernType,
  AllTaskType,
  TypeEnum,
  PartEnum,
  CategoryNameEnum,
  DemographicsType,
  TaskStatusEnum,
} from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CreateRoutineAllSolutionsType } from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import getUsersImage from "./getUserImage.js";
import { ObjectId } from "mongodb";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";

type Props = {
  specialConsiderations: string;
  allSolutions: CreateRoutineAllSolutionsType[];
  concerns: UserConcernType[];
  type: TypeEnum;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  userId: string;
  demographics: DemographicsType;
};

export default async function getSolutionsAndFrequencies({
  specialConsiderations,
  allSolutions,
  concerns,
  categoryName,
  type,
  demographics,
  userId,
  part,
}: Props) {
  const { sex } = demographics;

  const concernsNames = concerns.map((c) => c.name);

  let userImage = null;

  if (sex === "male" && type === "head") {
    userImage = await getUsersImage(String(userId));
  }

  const dontSuggestCleanShave =
    sex === "male" &&
    type === "head" &&
    userImage &&
    concernsNames.includes("ungroomed_facial_hair");

  try {
    const callback = () =>
      incrementProgress({
        operationKey: type,
        increment: 1,
        userId: String(userId),
      });

    const moustacheCheck = {
      isMini: true,
      content: [
        {
          type: "text",
          text: `Does the person have a beard or moustache? If yes, don't suggest a clean shave.`,
        },
        {
          type: "image_url",
          image_url: {
            url: userImage,
            detail: "low",
          },
        },
      ],
      callback,
    };

    const allSolutionsList = allSolutions.map((obj) => obj.key);

    const findSolutionsInstruction = `You are a ${
      type === "head" ? "dermatologist and dentist" : "fitness coach"
    }. The user gives you a list of their concerns. Your goal is to select the single most effective solution for each of their concerns from this list of solutions: ${allSolutionsList.join(
      ", "
    )}. ALL NAMES FORMAT MUST BE EXACTLY AS IN THE LIST. Be concise and to the point.`;

    const allConcerns = concerns.map(
      (concern, index) =>
        `${index + 1}: ${concern.name}. Details: ${concern.explanation} ##`
    );

    const findSolutionsContentArray: RunType[] = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `My concerns are: ${allConcerns.join(", ")}`,
          },
          {
            type: "text",
            text: `Consider this my condition when choosing the solutions: ${specialConsiderations}`,
          },
        ],
        callback,
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Are there any more effective solutions for each concern in the list or not?`,
          },
        ],
        callback,
      },
    ];

    if (dontSuggestCleanShave && userImage) {
      findSolutionsContentArray.push(moustacheCheck as any);
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
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Are there any concerns that have no solutions from the list? If yes, remove them from the object.`,
          },
        ],
        callback,
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Return your latest updated JSON object in this format: {name of the concern: name of the solution}.`,
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
    const findAdditionalSolutionsInstruction = `In this all solutions list: \n\n<-- ALL SOLUTIONS LIST -->\n\n ${allSolutionsList.join(
      ", "
    )}\n\n<-- ALL SOLUTIONS LIST -->\n\n are there any solutions that would increase the effectiveness or comfort of these selected solutions: \n\n<-- SELECTED SOLUTIONS LIST -->\n\n ${JSON.stringify(
      findSolutionsResponse
    )}?. ALL NAMES FORMAT EXACTLY AS IN THE LIST. Think step-by-step. Be concise and to the point.`;

    const findAdditionalSolutionsContentArray = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Does the list have any supportive solutions that are typically used with the main solutions? If yes add them to the main list.`,
          },
        ],
        callback,
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Does you updated main list have any solutions that contradict each other or are contraindicated? If yes, remove the least relevant contradicated solutions.`,
          },
        ],
        callback,
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Does your latest list have any solutions that are very similar to each other such that using them together could be detrimental for effectiveness or health? If yes, remove the redundant solutions.`,
          },
        ],
        callback,
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Does your latest list have any solutions that are not related to these concerns: ${JSON.stringify(
              allConcerns
            )}? If yes, remove them.`,
          },
        ],
        callback,
      },
    ];

    if (dontSuggestCleanShave && userImage) {
      findAdditionalSolutionsContentArray.push(moustacheCheck as any);
    }

    if (specialConsiderations) {
      findAdditionalSolutionsContentArray.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `Does your latest list have any solutions that contradict this user's condition: ${specialConsiderations}? If yes, remove them.`,
          },
        ],
        callback,
      });
    }

    findAdditionalSolutionsContentArray.push(
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Does your latest list have any solutions that don't exist in the original list? If yes remove those.`,
          },
        ],
        callback,
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Are all the names in your latest suggestions written exaclty as in the lists? If not, rewrite them exactly as in the lists.`,
          },
        ],
        callback,
      }
    );

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
    }. The user gives you a list of solutions they are going to use. Your goal is to tell how many times in a month each solution should be done. Think step-by-step. Be concise and to the point. YOUR RESPONSE IS A TOTAL NUMBER OF APPLICATIONS IN A MONTH, NOT DAY OR WEEK.`;

    const stringOfSolutions = Object.values(updatedConcernsSolutionsMap)
      .flat()
      .join(", ");

    const findFrequenciesContentArray = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `I'm going to use these solutions: ${stringOfSolutions}. What would be the best usage frequency for each solution?`,
          },
        ],
        callback,
      },
    ];

    if (type === "head") {
      findFrequenciesContentArray.push({
        isMini: false,
        content: [
          {
            type: "text",
            text: `Do you think the frequencies should be modified for better effectiveness? If yes, modify them, if not leave as is.`,
          },
        ],
        callback,
      });
    }

    if (type === "body") {
      findFrequenciesContentArray.push({
        isMini: false,
        content: [
          {
            type: "text",
            text: `My general approach is to train each muscle group 2 times a week. Do you think the frequencies should be modified for achieving that? If yes, modify them. if not leave as is.`,
          },
        ],
        callback,
      });
    }

    if (specialConsiderations) {
      findFrequenciesContentArray.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `The user has the following condition: ${specialConsiderations}. Does it affect the frequencies? If yes modify the frequencies if not leave as is.`,
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

    const entriesOfConcerns = Object.entries(updatedConcernsSolutionsMap);
    const namesOfConcerns = entriesOfConcerns.map((entry) =>
      entry[0].toLowerCase()
    );

    const concernSolutions = entriesOfConcerns.map((entry) => entry[1]);

    for (const key of keysOfSolutions) {
      const relevantSolution = allSolutions.find((s) => s.key === key);

      if (!relevantSolution) continue;

      const {
        name,
        icon,
        color,
        description,
        instruction,
        requiredSubmissions,
      } = relevantSolution;

      const totalApplications = Math.max(
        Math.round(Number(findFrequencyResponse[key]) / 4.285714301020408), // needed to turn monthly frequency into weekly
        1
      );

      const totalUses = Math.max(
        1,
        Math.round(totalApplications / requiredSubmissions.length)
      );

      const ids = new Array(totalUses)
        .fill(new ObjectId())
        .map((_id) => ({ _id, status: TaskStatusEnum.ACTIVE }));

      const record: AllTaskType = {
        ids,
        name,
        key,
        icon,
        color,
        part,
        description,
        instruction,
        concern: null,
        completed: 0,
        unknown: 0,
        total: totalUses,
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
