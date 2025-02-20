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
  canceledTaskKeys: string[];
  allSolutions: CreateRoutineAllSolutionsType[];
  partConcerns: UserConcernType[];
  categoryName: CategoryNameEnum;
};

export default async function getAreCurrentTasksEnough({
  allSolutions,
  partConcerns,
  categoryName,
  taskFrequencyMap,
  canceledTaskKeys,
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
    const filteredSolutionsList = allSolutions
      .filter((s) => !canceledTaskKeys.includes(s.key))
      .map((obj) => obj.key)
      .join(", ");

    const isEnoughResponseType = z.object({
      areEnough: z
        .boolean()
        .describe(
          "true if the current tasks and their frequencies are enough to effectively address the concerns, or if there is no relevant tasks in the list. False otherwise."
        ),
    });

    const checkIfEnoughSystem = `You are a dermatologist, dentist and fitness coach. The user tells you their concerns and the solutions with their monthly frequencies that they are going to use to address the concerns. Your goal is to tell if the number of solutions and their frequency is optimal, or if more solutions should be added from this list ${filteredSolutionsList}. Be concise and to the point.`;

    const checkIfEnoughRuns: RunType[] = [
      {
        isMini: false,
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `My concerns are: ${concernsNames.join(", ")}`,
          },
          {
            type: "text",
            text: `My solutions and their monthly frequencies are: ${JSON.stringify(
              taskFrequencyMap
            )}`,
          },
          {
            type: "text",
            text: `Are my solutions and frequencies enough for addressing my concerns effectively?`,
          },
        ],
        responseFormat: zodResponseFormat(
          isEnoughResponseType,
          "isEnoughResponseType"
        ),
        callback,
      },
    ];

    const { areEnough }: { [key: string]: string } = await askRepeatedly({
      userId: String(userId),
      categoryName,
      systemContent: checkIfEnoughSystem,
      runs: checkIfEnoughRuns as RunType[],
      functionName: "getAreCurrentTasksEnough",
    });

    return areEnough;
  } catch (error) {
    throw httpError(error);
  }
}
