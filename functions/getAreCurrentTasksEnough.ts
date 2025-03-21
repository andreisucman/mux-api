import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import incrementProgress from "helpers/incrementProgress.js";
import { UserConcernType, CategoryNameEnum } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CreateRoutineAllSolutionsType } from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

type Props = {
  userId: string;
  taskFrequencyMap: { [key: string]: number };
  allSolutions: CreateRoutineAllSolutionsType[];
  partConcerns: UserConcernType[];
  categoryName: CategoryNameEnum;
};

export default async function getAreCurrentTasksEnough({
  allSolutions,
  partConcerns,
  categoryName,
  taskFrequencyMap,
  userId,
}: Props) {
  const callback = () =>
    incrementProgress({
      operationKey: "routine",
      value: 1,
      userId: String(userId),
    });

  try {
    const concernsNames = partConcerns.map((c) => c.name);

    const IsEnoughResponseType = z.object({
      areCurrentSolutionsOkay: z
        .boolean()
        .describe(
          "True if there is no relevant solutions in the list, or if the current routine is enough to effectively address the concerns. False otherwise."
        ),
    });

    const solutionsList = allSolutions.map((obj) => obj.key).join(", ");

    const checkIfEnoughSystem = `You are a dermatologist, dentist and fitness coach. The user tells you their concerns and gives their improvement routine with monthly frequencies for addressing the concerns. Your goal is to check if the number of solutions in their routine and their frequency is optimal for addressing their concerns, or if more solutions should be added from this list ${solutionsList}. Consider the solutions from the list ONLY.`;

    const checkIfEnoughRuns: RunType[] = [
      {
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `My concerns are: ${concernsNames.join(", ")}`,
          },
          {
            type: "text",
            text: `My current routine with the monthly frequencies for each solution: ${JSON.stringify(
              taskFrequencyMap
            )}`,
          },
        ],
        responseFormat: zodResponseFormat(
          IsEnoughResponseType,
          "IsEnoughResponseType"
        ),
        callback,
      },
    ];

    const { areCurrentSolutionsOkay }: { [key: string]: string } =
      await askRepeatedly({
        userId: String(userId),
        categoryName,
        systemContent: checkIfEnoughSystem,
        runs: checkIfEnoughRuns as RunType[],
        functionName: "getAreCurrentTasksEnough",
      });

    return areCurrentSolutionsOkay;
  } catch (error) {
    throw httpError(error);
  }
}
