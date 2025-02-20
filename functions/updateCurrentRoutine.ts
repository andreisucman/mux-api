import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { calculateDaysDifference } from "helpers/utils.js";
import {
  UserConcernType,
  PartEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
  ProgressImageType,
} from "types.js";
import getSolutionsAndFrequencies from "functions/getSolutionsAndFrequencies.js";
import getRawSchedule from "functions/getRawSchedule.js";
import createTasks from "functions/createTasks.js";
import mergeSchedules from "functions/mergeSchedules.js";
import {
  CreateRoutineAllSolutionsType,
  CreateRoutineUserInfoType,
} from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import { db } from "init.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";

type Props = {
  part: PartEnum;
  routineId: string;
  partImages: ProgressImageType[];
  partConcerns: UserConcernType[];
  allSolutions: CreateRoutineAllSolutionsType[];
  userInfo: CreateRoutineUserInfoType;
  routineStartDate: string;
  categoryName: CategoryNameEnum;
};

export default async function updateCurrentRoutine({
  part,
  partImages,
  partConcerns,
  routineId,
  allSolutions,
  userInfo,
  categoryName,
  routineStartDate,
}: Props) {
  const { _id: userId, name: userName, specialConsiderations } = userInfo;

  try {
    if (!routineId) throw httpError("No routineId");

    const currentRoutine = await doWithRetries(async () =>
      db.collection("Routine").findOne(
        { _id: new ObjectId(routineId) },
        {
          projection: {
            finalSchedule: 1,
            allTasks: 1,
            concerns: 1,
            lastDate: 1,
          },
        }
      )
    );

    if (!currentRoutine) throw httpError("No currentRoutine");

    const daysDifference = calculateDaysDifference(
      new Date(),
      currentRoutine.lastDate
    );

    const solutionsAndFrequencies = await doWithRetries(async () =>
      getSolutionsAndFrequencies({
        specialConsiderations,
        allSolutions,
        categoryName,
        partConcerns,
        demographics: userInfo.demographics,
        userId: String(userId),
        partImages,
        part,
      })
    );

    const rawSchedule = await doWithRetries(async () =>
      getRawSchedule({
        solutionsAndFrequencies,
        days: daysDifference,
        routineStartDate,
      })
    );

    const mergedSchedule = await doWithRetries(async () =>
      mergeSchedules({
        rawNewSchedule: rawSchedule,
        currentSchedule: currentRoutine.finalSchedule,
        userId: String(userId),
        specialConsiderations,
        categoryName,
      })
    );

    let tasksToInsert = await createTasks({
      part,
      userInfo,
      allSolutions,
      categoryName,
      finalSchedule: mergedSchedule,
      createOnlyTheseKeys: solutionsAndFrequencies.map((sol) => sol.key),
    });

    if (tasksToInsert.length > 0)
      await doWithRetries(async () =>
        db.collection("Task").insertMany(tasksToInsert)
      );

    const allTasksWithDateAndIds = addDateAndIdsToAllTasks({
      allTasksWithoutDates: solutionsAndFrequencies,
      tasksToInsert,
    });

    const newAllTasks = combineAllTasks({
      oldAllTasks: currentRoutine.allTasks,
      newAllTasks: allTasksWithDateAndIds,
    });

    const allUniqueConcerns: UserConcernType[] = [
      ...currentRoutine.concerns,
      ...partConcerns,
    ].filter((obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i);

    const { minDate, maxDate } = getMinAndMaxRoutineDates(newAllTasks);

    await doWithRetries(async () =>
      db.collection("Routine").updateOne(
        {
          _id: new ObjectId(currentRoutine._id),
        },
        {
          $set: {
            userName,
            finalSchedule: mergedSchedule,
            status: RoutineStatusEnum.ACTIVE,
            concerns: allUniqueConcerns,
            allTasks: newAllTasks,
            startsAt: new Date(minDate),
            lastDate: new Date(maxDate),
          },
        }
      )
    );

    updateTasksAnalytics({
      userId: String(userId),
      tasksToInsert,
      keyOne: "tasksCreated",
      keyTwo: "manuallyTasksCreated",
    });
  } catch (err) {
    throw httpError(err);
  }
}
