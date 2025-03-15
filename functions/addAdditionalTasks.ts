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
  AllTaskTypeWithIds,
} from "@/types.js";
import addAnalysisStatusError from "functions/addAnalysisStatusError.js";
import {
  CreateRoutineAllSolutionsType,
  CreateRoutineUserInfoType,
} from "types/createRoutineTypes.js";
import httpError from "@/helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import getAreCurrentTasksEnough from "./getAreCurrentTasksEnough.js";
import getSolutionsAndFrequencies from "./getSolutionsAndFrequencies.js";

type Props = {
  part: PartEnum;
  partImages: ProgressImageType[];
  categoryName: CategoryNameEnum;
  partConcerns: UserConcernType[];
  incrementMultiplier?: number;
  currentTasks: TaskType[];
  allTasks: AllTaskTypeWithIds[];
  allSolutions: CreateRoutineAllSolutionsType[];
  currentSchedule: { [key: string]: ScheduleTaskType[] };
  userInfo: CreateRoutineUserInfoType;
  routineStartDate: string;
  latestCompletedTasks: { [key: string]: any };
};

export default async function addAdditionalTasks({
  part,
  allTasks,
  userInfo,
  allSolutions,
  partImages,
  partConcerns,
  currentTasks,
  incrementMultiplier = 1,
  currentSchedule,
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

    const additionalAllTasks = await doWithRetries(async () =>
      getSolutionsAndFrequencies({
        userId: String(userId),
        part,
        currentSolutions: taskFrequencyMap,
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
    let filteredAllTasks = allTasks.filter(
      (r) => !existingAllTasksKeys.includes(r.key)
    );

    const rawNewSchedule = await doWithRetries(async () =>
      getRawSchedule({
        allTasks: filteredAllTasks,
        routineStartDate,
        days: 7,
        timeZone,
      })
    );

    const mergedSchedule = await doWithRetries(async () =>
      mergeSchedules({
        part,
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

    const additionalTasksToInsert = await doWithRetries(async () =>
      createTasks({
        finalSchedule: mergedSchedule,
        allSolutions,
        createOnlyTheseKeys: additionalAllTasks.map((o) => o.key),
        categoryName,
        userInfo,
        part,
      })
    );

    const totalTasksToInsert = [...currentTasks, ...additionalTasksToInsert];

    const allTasksWithDates = addDateAndIdsToAllTasks({
      allTasksWithoutDates: allTasks,
      tasksToInsert: totalTasksToInsert,
    });

    return {
      areEnough,
      mergedSchedule,
      totalAllTasks: allTasksWithDates,
      totalTasksToInsert,
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
