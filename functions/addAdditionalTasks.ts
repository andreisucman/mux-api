import doWithRetries from "helpers/doWithRetries.js";
import createTasks from "functions/createTasks.js";
import mergeSchedules from "functions/mergeSchedules.js";
import getRawSchedule from "functions/getRawSchedule.js";
import {
  UserConcernType,
  TaskType,
  PartEnum,
  CategoryNameEnum,
  ProgressImageType,
} from "@/types.js";
import getSolutionsAndFrequencies from "./getSolutionsAndFrequencies.js";
import addAnalysisStatusError from "functions/addAnalysisStatusError.js";
import {
  CreateRoutineUserInfoType,
  CreateRoutineAllSolutionsType,
} from "types/createRoutineTypes.js";
import httpError from "@/helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import incrementProgress from "@/helpers/incrementProgress.js";

type Props = {
  part: PartEnum;
  partImages: ProgressImageType[];
  categoryName: CategoryNameEnum;
  partConcerns: UserConcernType[];
  currentTasks: TaskType[];
  currentSchedule: { [key: string]: ScheduleTaskType[] };
  userInfo: CreateRoutineUserInfoType;
  allSolutions: CreateRoutineAllSolutionsType[];
};

export default async function addAdditionalTasks({
  part,
  userInfo,
  partImages,
  partConcerns,
  currentTasks,
  currentSchedule,
  allSolutions,
  categoryName,
}: Props) {
  const { _id: userId, specialConsiderations, demographics } = userInfo;

  try {
    const solutionsAndFrequencies = await doWithRetries(async () =>
      getSolutionsAndFrequencies({
        userId: String(userId),
        part,
        partImages,
        partConcerns,
        specialConsiderations,
        allSolutions,
        demographics,
        categoryName,
      })
    );

    await incrementProgress({
      value: 2,
      operationKey: "routine",
      userId: String(userId),
    });

    const existingAllTasksKeys = currentTasks.map((t) => t.key);
    let filteredSolutionsAndFrequencies = solutionsAndFrequencies.filter(
      (r) => !existingAllTasksKeys.includes(r.key)
    );

    const rawNewSchedule = await doWithRetries(async () =>
      getRawSchedule({
        solutionsAndFrequencies: filteredSolutionsAndFrequencies,
        concerns: partConcerns,
        days: 7,
      })
    );

    const mergedSchedule = await doWithRetries(async () =>
      mergeSchedules({
        rawNewSchedule,
        currentSchedule,
        userId: String(userId),
        categoryName,
      })
    );

    await incrementProgress({
      value: 3,
      operationKey: "routine",
      userId: String(userId),
    });

    const tasksToInsert = await doWithRetries(async () =>
      createTasks({
        finalSchedule: mergedSchedule,
        allSolutions,
        categoryName,
        userInfo,
        part,
      })
    );

    const allTasksWithDates = addDateAndIdsToAllTasks({
      allTasksWithoutDates: solutionsAndFrequencies,
      tasksToInsert,
    });

    return {
      mergedSchedule,
      additionalAllTasks: allTasksWithDates,
      additionalTasksToInsert: tasksToInsert,
    };
  } catch (error) {
    await addAnalysisStatusError({
      operationKey: "routine",
      userId: String(userId),
      message: "An unexpected error occured. Please try again.",
      originalMessage: error.message,
    });
    throw httpError(error);
  }
}
