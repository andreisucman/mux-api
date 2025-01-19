import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import createTasks from "functions/createTasks.js";
import mergeSchedules from "functions/mergeSchedules.js";
import getRawSchedule from "functions/getRawSchedule.js";
import {
  UserConcernType,
  TaskType,
  TypeEnum,
  PartEnum,
  CategoryNameEnum,
} from "@/types.js";
import getSolutionsAndFrequencies from "./getSolutionsAndFrequencies.js";
import addAnalysisStatusError from "functions/addAnalysisStatusError.js";
import {
  CreateRoutineUserInfoType,
  CreateRoutineAllSolutionsType,
} from "types/createRoutineTypes.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import addDateToAllTaskIds from "@/helpers/addDateToAllTasks.js";

type Props = {
  type: TypeEnum;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  concerns: UserConcernType[];
  currentTasks: TaskType[];
  currentSchedule: { [key: string]: ScheduleTaskType[] };
  userInfo: CreateRoutineUserInfoType;
  allSolutions: CreateRoutineAllSolutionsType[];
};

export default async function addAdditionalTasks({
  type,
  part,
  userInfo,
  concerns,
  currentSchedule,
  allSolutions,
  categoryName,
}: Props) {
  const { _id: userId, specialConsiderations, demographics } = userInfo;

  try {
    const solutionsAndFrequencies = await doWithRetries(async () =>
      getSolutionsAndFrequencies({
        userId: String(userId),
        type,
        part,
        concerns,
        specialConsiderations,
        allSolutions,
        demographics,
        categoryName,
      })
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: type },
          { $inc: { progress: 2 } }
        )
    );

    const { rawSchedule: rawNewSchedule } = await doWithRetries(async () =>
      getRawSchedule({
        solutionsAndFrequencies,
        concerns,
        days: 6,
      })
    );

    const mergedSchedule = await doWithRetries(async () =>
      mergeSchedules({
        rawNewSchedule,
        currentSchedule,
        userId: String(userId),
        type,
        categoryName,
      })
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: type },
          { $inc: { progress: 3 } }
        )
    );

    const tasksToInsert = await doWithRetries(async () =>
      createTasks({
        finalSchedule: mergedSchedule,
        allSolutions,
        categoryName,
        userInfo,
        type,
        part,
      })
    );

    const allTasksWithDates = addDateToAllTaskIds({
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
      operationKey: type,
      userId: String(userId),
      message: "An unexpected error occured. Please try again.",
      originalMessage: error.message,
    });
    throw httpError(error);
  }
}
