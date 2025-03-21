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
import getRawSchedule from "functions/getRawSchedule.js";
import createTasks from "functions/createTasks.js";
import mergeSchedules from "functions/mergeSchedules.js";
import { CreateRoutineUserInfoType } from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import { db } from "init.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import chooseSolutionsForConcerns, {
  ConcernsSolutionsAndFrequenciesType,
} from "./chooseSolutionsForConcerns.js";
import createSolutionData from "./createSolutionData.js";

type Props = {
  part: PartEnum;
  routineId: string;
  incrementMultiplier?: number;
  partImages: ProgressImageType[];
  partConcerns: UserConcernType[];
  userInfo: CreateRoutineUserInfoType;
  routineStartDate: string;
  currentSolutions: { [key: string]: number };
  categoryName: CategoryNameEnum;
};

export default async function updateCurrentRoutine({
  part,
  partImages,
  partConcerns,
  routineId,
  userInfo,
  currentSolutions,
  categoryName,
  routineStartDate,
  incrementMultiplier = 1,
}: Props) {
  const {
    _id: userId,
    timeZone,
    name: userName,
    specialConsiderations,
    demographics,
    country,
  } = userInfo;

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

    const { concernsSolutionsAndFrequencies, areCurrentSolutionsOkay } =
      await chooseSolutionsForConcerns({
        userId: String(userId),
        part,
        timeZone,
        country,
        currentSolutions,
        categoryName,
        demographics,
        partConcerns,
        partImages,
        incrementMultiplier,
        specialConsiderations,
      });

    if (areCurrentSolutionsOkay) return;

    const { allSolutions: additionalSolutions, allTasks: additionalTasks } =
      await createSolutionData({
        categoryName,
        concernsSolutionsAndFrequencies:
          concernsSolutionsAndFrequencies as unknown as ConcernsSolutionsAndFrequenciesType,
        part,
        userId: String(userId),
      });

    const rawSchedule = await doWithRetries(async () =>
      getRawSchedule({
        allTasks: additionalTasks,
        days: daysDifference,
        routineStartDate,
      })
    );

    const mergedSchedule = await doWithRetries(async () =>
      mergeSchedules({
        part,
        rawNewSchedule: rawSchedule,
        currentSchedule: currentRoutine.finalSchedule,
        userId: String(userId),
        specialConsiderations,
        categoryName,
        incrementMultiplier,
      })
    );

    let tasksToInsert = await createTasks({
      part,
      userInfo,
      allSolutions: additionalSolutions,
      categoryName,
      finalSchedule: mergedSchedule,
      createOnlyTheseKeys: additionalTasks.map((sol) => sol.key),
    });

    if (tasksToInsert.length > 0)
      await doWithRetries(async () =>
        db.collection("Task").insertMany(tasksToInsert)
      );

    const additionalTasksWithDateAndIds = addDateAndIdsToAllTasks({
      allTasksWithoutDates: additionalTasks,
      tasksToInsert,
    });

    const newAllTasks = combineAllTasks({
      oldAllTasks: currentRoutine.allTasks,
      newAllTasks: additionalTasksWithDateAndIds,
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
      keyTwo: "manualTasksCreated",
    });
  } catch (err) {
    throw httpError(err);
  }
}
