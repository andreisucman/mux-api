import * as dotenv from "dotenv";
dotenv.config();

import { AllTaskType, CategoryNameEnum, PartEnum } from "types.js";
import httpError from "helpers/httpError.js";
import { ConcernsSolutionsAndFrequenciesType } from "./chooseSolutionsForConcerns.js";
import createSolutionDescriptionAndInstruction from "./createSolutionDescrptionAndInstruction.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import createSolutionInfo from "./createSolutionInfo.js";

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

    const taskKeyDescriptionInstruction = await Promise.all(
      descriptionAndInstructionsPromises
    );

    const taskInfoPromises = taskKeyDescriptionInstruction.map(
      ({ key, description, instruction }) =>
        doWithRetries(async () =>
          createSolutionInfo({
            categoryName,
            concern: solutionConcernMap[key],
            description,
            instruction,
            solution: key,
            userId,
          })
        )
    );

    const taskInfoRecords = await Promise.all(taskInfoPromises);

    /* change names of solutions to snake case */
    const valuesWithConcerns: AllTaskType[] = [];

    const entriesOfConcerns = Object.entries(concernsSolutionsAndFrequencies);
    const namesOfConcerns = entriesOfConcerns.map((entry) =>
      entry[0].toLowerCase()
    );

    const concernSolutions = entriesOfConcerns.flatMap((entry) =>
      entry[1].map((e) => e.solution)
    );

    for (const key of keysOfSolutions) {
      const relevantSolution = taskInfoRecords.find((s) => s.key === key);

      if (!relevantSolution) continue;

      const { name, icon, color, description, instruction } = relevantSolution;

      const total = Math.max(
        Math.round(Number(frequencyMap[key]) / 4.285714301020408), // needed to turn monthly frequency into weekly
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

    return {
      allSolutions: taskInfoRecords,
      allTasks: valuesWithConcerns.sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (error) {
    throw httpError(error);
  }
}
