import {
  UserConcernType,
  TaskType,
  PartEnum,
  CategoryNameEnum,
  ProgressImageType,
  AllTaskTypeWithIds,
} from "@/types.js";
import addAnalysisStatusError from "functions/addAnalysisStatusError.js";
import { CreateRoutineUserInfoType } from "types/createRoutineTypes.js";
import httpError from "@/helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import chooseSolutionsForConcerns from "./chooseSolutionsForConcerns.js";
import createSolutionData from "./createSolutionData.js";
import createScheduleAndTasks from "./createScheduleAndTasks.js";

type Props = {
  part: PartEnum;
  partImages: ProgressImageType[];
  categoryName: CategoryNameEnum;
  partConcerns: UserConcernType[];
  incrementMultiplier?: number;
  currentTasks: TaskType[];
  allTasks: AllTaskTypeWithIds[];
  currentSchedule: { [key: string]: ScheduleTaskType[] };
  userInfo: CreateRoutineUserInfoType;
  routineStartDate: string;
  latestProgressFeedback?: string;
};

export default async function addAdditionalTasks({
  part,
  allTasks,
  userInfo,
  partImages,
  partConcerns,
  currentTasks,
  incrementMultiplier = 1,
  currentSchedule,
  routineStartDate,
  categoryName,
  latestProgressFeedback,
}: Props) {
  const {
    _id: userId,
    country,
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

    const { areCurrentSolutionsOkay, updatedListOfSolutions } =
      await chooseSolutionsForConcerns({
        userId: String(userId),
        part,
        timeZone,
        country,
        currentSolutions: taskFrequencyMap,
        categoryName,
        demographics,
        partConcerns,
        partImages,
        latestProgressFeedback,
        incrementMultiplier,
        specialConsiderations,
      });

    if (areCurrentSolutionsOkay) {
      return {
        mergedSchedule: currentSchedule,
        totalAllTasks: allTasks,
        totalTasksToInsert: [],
      };
    }

    const { allSolutions: allUpdatedSolutions, allTasks: allUpdatedTasks } =
      await createSolutionData({
        categoryName,
        concernsSolutionsAndFrequencies: updatedListOfSolutions,
        part,
        userId: String(userId),
      });

    await incrementProgress({
      value: 2 * incrementMultiplier,
      operationKey: "routine",
      userId: String(userId),
    });

    const { allTasksWithDateAndIds, finalSchedule, tasksToInsert } =
      await createScheduleAndTasks({
        allSolutions: allUpdatedSolutions,
        allTasks: allUpdatedTasks,
        categoryName,
        incrementMultiplier,
        part,
        partConcerns,
        routineStartDate,
        userInfo,
        specialConsiderations,
      });

    return {
      areCurrentSolutionsOkay,
      mergedSchedule: finalSchedule,
      totalAllTasks: allTasksWithDateAndIds,
      totalTasksToInsert: tasksToInsert,
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
