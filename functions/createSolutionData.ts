import * as dotenv from "dotenv";
dotenv.config();

import { AllTaskType, CategoryNameEnum, PartEnum } from "types.js";
import httpError from "helpers/httpError.js";
import createSolutionDescriptionAndInstruction from "./createSolutionDescrptionAndInstruction.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import createSolutionInfo from "./createSolutionInfo.js";
import { CreateRoutineAllSolutionsType } from "@/types/createRoutineTypes.js";
import { RoutineSuggestionTaskType } from "@/types/updateRoutineSuggestionTypes.js";

type Props = {
  userId: string;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  suggestedTasks: { [concern: string]: RoutineSuggestionTaskType[] };
};

export default async function createSolutionData({ userId, part, categoryName, suggestedTasks }: Props) {
  try {
    const frequencyMap = Object.values(suggestedTasks)
      .flat()
      .reduce((a, c) => {
        if (a[c.task]) {
          a[c.task] += c.numberOfTimesInAWeek;
        } else {
          a[c.task] = c.numberOfTimesInAWeek;
        }
        return a;
      }, {});

    const solutionConcernMap = Object.values(suggestedTasks)
      .flat()
      .reduce((a, c) => {
        a[c.task] = c.concern;
        return a;
      }, {});

    const keysOfSolutions = Object.keys(frequencyMap);

    const descriptionAndInstructionsPromises = keysOfSolutions.map((key) =>
      doWithRetries(() =>
        createSolutionDescriptionAndInstruction({
          categoryName,
          task: key,
          part,
          userId,
          concern: solutionConcernMap[key],
        })
      )
    );

    const taskKeyDescriptionInstruction = await Promise.all(descriptionAndInstructionsPromises);

    const taskInfoPromises = taskKeyDescriptionInstruction.map(({ key, description, instruction }) => {
      const concern = solutionConcernMap[key];
      const relevantTask = suggestedTasks[concern].find((t) => t.task === key);

      return doWithRetries(async () =>
        createSolutionInfo({
          icon: relevantTask.icon,
          color: relevantTask.color,
          categoryName,
          concern,
          description,
          instruction,
          task: key,
          userId,
        })
      );
    });

    let taskInfoRecords: CreateRoutineAllSolutionsType[] = await Promise.all(taskInfoPromises);

    /* change names of solutions to snake case */
    const valuesWithConcerns: AllTaskType[] = [];

    for (const key of keysOfSolutions) {
      const relevantSolution = taskInfoRecords.find((s) => s.key === key);

      if (!relevantSolution) continue;

      const { name, icon, color } = relevantSolution;

      const total = Math.max(
        Math.round(Number(frequencyMap[key]) / Number(process.env.WEEKLY_TASK_MULTIPLIER)), // needed to turn monthly frequency into weekly
        1
      );

      const record: AllTaskType = {
        name,
        key,
        icon,
        color,
        concern: null,
        total,
      };

      record.concern = solutionConcernMap[key];
      valuesWithConcerns.push(record);
    }

    return {
      allSolutions: taskInfoRecords,
      allTasks: valuesWithConcerns.sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (error) {
    throw httpError(error);
  }
}
