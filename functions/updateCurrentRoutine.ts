import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { calculateDaysDifference } from "helpers/utils.js";
import {
  UserConcernType,
  TypeEnum,
  PartEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
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
import updateTasksAnalytics from "./updateTasksCreatedAnalytics.js";
import { db } from "init.js";
import addDateToAllTasks from "@/helpers/addDateToAllTasks.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";

type Props = {
  type: TypeEnum;
  part: PartEnum;
  routineId: string;
  partConcerns: UserConcernType[];
  allSolutions: CreateRoutineAllSolutionsType[];
  userInfo: CreateRoutineUserInfoType;
  specialConsiderations: string;
  categoryName: CategoryNameEnum;
};

export default async function updateCurrentRoutine({
  type,
  part,
  partConcerns,
  routineId,
  allSolutions,
  userInfo,
  categoryName,
  specialConsiderations,
}: Props) {
  const { _id: userId, name: userName } = userInfo;

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
        concerns: partConcerns,
        demographics: userInfo.demographics,
        userId: String(userId),
        type,
        part,
      })
    );

    const { rawSchedule } = await doWithRetries(async () =>
      getRawSchedule({
        solutionsAndFrequencies,
        concerns: partConcerns,
        days: daysDifference,
      })
    );

    const mergedSchedule = await doWithRetries(async () =>
      mergeSchedules({
        rawNewSchedule: rawSchedule,
        currentSchedule: currentRoutine.finalSchedule,
        userId: String(userId),
        categoryName,
        type,
      })
    );

    let tasksToInsert = await createTasks({
      part,
      type,
      userInfo,
      allSolutions,
      categoryName,
      finalSchedule: mergedSchedule,
      createOnlyTheseKeys: solutionsAndFrequencies.map((sol) => sol.key),
    });

    const newTaskIds = solutionsAndFrequencies
      .flatMap((r) => r.ids)
      .map((idObj) => String(idObj._id));

    tasksToInsert = tasksToInsert
      .filter((t) => newTaskIds.includes(String(t._id)))
      .map((task) => ({
        ...task,
        routineId: new ObjectId(currentRoutine._id),
      }));

    await doWithRetries(async () =>
      db.collection("Task").insertMany(tasksToInsert)
    );

    const allTasksWithDates = addDateToAllTasks({
      allTasksWithoutDates: solutionsAndFrequencies,
      tasksToInsert,
    });

    const newAllTasks = combineAllTasks({
      oldAllTasks: currentRoutine.allTasks,
      newAllTasks: allTasksWithDates,
    });

    const allUniqueConcerns: UserConcernType[] = [
      ...currentRoutine.concerns,
      ...partConcerns,
    ].filter((obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i);

    await doWithRetries(async () =>
      db.collection("Routine").updateOne(
        {
          _id: new ObjectId(currentRoutine._id),
        },
        {
          $set: {
            finalSchedule: mergedSchedule,
            status: RoutineStatusEnum.ACTIVE,
            concerns: allUniqueConcerns,
            allTasks: newAllTasks,
            userName,
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
