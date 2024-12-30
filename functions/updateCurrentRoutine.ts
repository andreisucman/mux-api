import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { calculateDaysDifference } from "helpers/utils.js";
import {
  UserConcernType,
  TypeEnum,
  PartEnum,
  CategoryNameEnum,
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
import { db } from "init.js";
import updateTasksAnalytics from "./updateTasksCreatedAnalytics.js";

type Props = {
  type: TypeEnum;
  part: PartEnum;
  routineId: string;
  concerns: UserConcernType[];
  allSolutions: CreateRoutineAllSolutionsType[];
  userInfo: CreateRoutineUserInfoType;
  specialConsiderations: string;
  categoryName: CategoryNameEnum;
};

export default async function updateCurrentRoutine({
  type,
  part,
  concerns,
  routineId,
  allSolutions,
  userInfo,
  categoryName,
  specialConsiderations,
}: Props) {
  const { _id: userId } = userInfo;

  try {
    if (!routineId) throw httpError("No routineId");

    const currentRoutine = await doWithRetries(async () =>
      db.collection("Routine").findOne({ _id: new ObjectId(routineId) })
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
        concerns,
        userInfo,
        type,
        part,
      })
    );

    const { rawSchedule } = await doWithRetries(async () =>
      getRawSchedule({
        solutionsAndFrequencies,
        concerns,
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

    const newAllTasks = [
      ...currentRoutine.allTasks,
      ...solutionsAndFrequencies,
    ];
    const newConcerns = [...currentRoutine.concerns, ...concerns];

    await doWithRetries(async () =>
      db.collection("Routine").updateOne(
        {
          _id: new ObjectId(currentRoutine._id),
        },
        {
          $set: {
            finalSchedule: mergedSchedule,
            status: "active",
            concerns: newConcerns,
            allTasks: newAllTasks,
          },
        }
      )
    );

    let newTasksToInsert = await createTasks({
      allSolutions,
      concerns,
      finalSchedule: mergedSchedule,
      categoryName,
      part,
      type,
      userInfo,
      createOnlyTheseKeys: solutionsAndFrequencies.map((sol) => sol.key),
    });

    newTasksToInsert = newTasksToInsert.map((task) => ({
      ...task,
      routineId: new ObjectId(currentRoutine._id),
    }));

    await doWithRetries(async () =>
      db.collection("Task").insertMany(newTasksToInsert)
    );

    updateTasksAnalytics(
      newTasksToInsert,
      "tasksCreated",
      "manuallyTasksCreated"
    );
  } catch (err) {
    throw httpError(err);
  }
}
