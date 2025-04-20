import * as dotenv from "dotenv";
dotenv.config();

import { AllTaskType, CategoryNameEnum, PartEnum } from "types.js";
import httpError from "helpers/httpError.js";
import { ConcernsSolutionsAndFrequenciesType } from "./chooseSolutionsForConcerns.js";
import createSolutionDescriptionAndInstruction from "./createSolutionDescrptionAndInstruction.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import createSolutionInfo from "./createSolutionInfo.js";
import findEmoji from "@/helpers/findEmoji.js";
import { CreateRoutineAllSolutionsType } from "@/types/createRoutineTypes.js";

type Props = {
  userId: string;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  concernsSolutionsAndFrequencies: ConcernsSolutionsAndFrequenciesType;
};

export default async function createSolutionData({
  userId,
  part,
  categoryName,
  concernsSolutionsAndFrequencies,
}: Props) {
  try {
    const frequencyMap = Object.values(concernsSolutionsAndFrequencies)
      .flat()
      .reduce((a, c) => {
        if (a[c.solution]) {
          a[c.solution] += c.monthlyFrequency;
        } else {
          a[c.solution] = c.monthlyFrequency;
        }
        return a;
      }, {});

    const solutionConcernMap = Object.values(concernsSolutionsAndFrequencies)
      .flat()
      .reduce((a, c) => {
        if (a[c.solution]) {
          a[c.solution] += c.concern;
        } else {
          a[c.solution] = c.concern;
        }
        return a;
      }, {});

    const keysOfSolutions = Object.keys(frequencyMap);

    const descriptionAndInstructionsPromises = keysOfSolutions.map((key) =>
      doWithRetries(() =>
        createSolutionDescriptionAndInstruction({
          categoryName,
          solution: key,
          part,
          userId,
          concern: solutionConcernMap[key],
        })
      )
    );

    const taskKeyDescriptionInstruction = await Promise.all(descriptionAndInstructionsPromises);

    const taskInfoPromises = taskKeyDescriptionInstruction.map(({ key, description, instruction }) => {
      const concern = solutionConcernMap[key];

      return doWithRetries(async () =>
        createSolutionInfo({
          categoryName,
          concern,
          description,
          instruction,
          solution: key,
          userId,
        })
      );
    });

    let taskInfoRecords: CreateRoutineAllSolutionsType[] = await Promise.all(taskInfoPromises);

    const iconsMap = await findEmoji({
      userId,
      taskNames: taskInfoRecords.map((obj) => obj.name),
    });

    taskInfoRecords = taskInfoRecords.map((t) => ({
      ...t,
      icon: iconsMap[t.name],
    }));

    /* change names of solutions to snake case */
    const valuesWithConcerns: AllTaskType[] = [];

    for (const key of keysOfSolutions) {
      const relevantSolution = taskInfoRecords.find((s) => s.key === key);

      if (!relevantSolution) continue;

      const { name, icon, color } = relevantSolution;

      const total = Math.max(
        Math.round(Number(frequencyMap[key]) / 4.285714301020408), // needed to turn monthly frequency into weekly
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
