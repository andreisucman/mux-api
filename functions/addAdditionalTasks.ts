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
import addAnalysisStatusError from "functions/addAnalysisStatusError.js";
import {
  CreateRoutineUserInfoType,
  CreateRoutineAllSolutionsType,
} from "types/createRoutineTypes.js";
import httpError from "@/helpers/httpError.js";
import getAdditionalSolutionsAndFrequencies from "./getAdditionalSolutionsAndFrequencies.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import getAreCurrentTasksEnough from "./getAreCurrentTasksEnough.js";
import incrementProgress from "@/helpers/incrementProgress.js";

type Props = {
  part: PartEnum;
  partImages: ProgressImageType[];
  categoryName: CategoryNameEnum;
  partConcerns: UserConcernType[];
  incrementMultiplier?: number;
  currentTasks: TaskType[];
  currentSchedule: { [key: string]: ScheduleTaskType[] };
  userInfo: CreateRoutineUserInfoType;
  routineStartDate: string;
  allSolutions: CreateRoutineAllSolutionsType[];
  latestCompletedTasks: { [key: string]: any };
};

export default async function addAdditionalTasks({
  part,
  userInfo,
  partImages,
  partConcerns,
  currentTasks,
  incrementMultiplier = 1,
  currentSchedule,
  allSolutions,
  routineStartDate,
  categoryName,
  latestCompletedTasks,
}: Props) {
  const {
    _id: userId,
    timeZone,
    specialConsiderations,
    demographics,
  } = userInfo;

  try {
    let taskFrequencyMap = currentTasks.reduce(
      (a: { [key: string]: number }, c: TaskType) => {
        if (a[c.key]) {
          a[c.key] += 1;
        } else {
          a[c.key] = 1;
        }
        return a;
      },
      {}
    );

    // make the frequencies monthly
    taskFrequencyMap = Object.fromEntries(
      Object.entries(taskFrequencyMap).map(([key, value]) => [key, value * 4])
    );

    const areEnough = await getAreCurrentTasksEnough({
      allSolutions,
      categoryName,
      partConcerns,
      taskFrequencyMap,
      userId: String(userId),
    });

    if (areEnough) {
      return {
        mergedSchedule: currentSchedule,
        additionalAllTasks: [],
        additionalTasksToInsert: [],
      };
    }

    const currentSolutions = Object.keys(taskFrequencyMap);

    const solutionsAndFrequencies = await doWithRetries(async () =>
      getAdditionalSolutionsAndFrequencies({
        userId: String(userId),
        part,
        currentSolutions,
        partImages,
        partConcerns,
        specialConsiderations,
        incrementMultiplier,
        allSolutions,
        demographics,
        categoryName,
      })
    );

    await incrementProgress({
      value: 2 * incrementMultiplier,
      operationKey: "routine",
      userId: String(userId),
    });

    const existingAllTasksKeys = currentTasks.map((t) => t.key);

    // to ensure no existing tasks in the new solutions
    let filteredSolutionsAndFrequencies = solutionsAndFrequencies.filter(
      (r) => !existingAllTasksKeys.includes(r.key)
    );

    const rawNewSchedule = await doWithRetries(async () =>
      getRawSchedule({
        solutionsAndFrequencies: filteredSolutionsAndFrequencies,
        routineStartDate,
        days: 7,
        timeZone,
      })
    );

    const mergedSchedule = await doWithRetries(async () =>
      mergeSchedules({
        rawNewSchedule,
        currentSchedule,
        userId: String(userId),
        specialConsiderations,
        categoryName,
        incrementMultiplier,
        latestCompletedTasks,
      })
    );

    await incrementProgress({
      value: 3 * incrementMultiplier,
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
      tasksToInsert,
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
