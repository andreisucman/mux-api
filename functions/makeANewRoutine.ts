import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getRawSchedule from "functions/getRawSchedule.js";
import polishRawSchedule from "functions/polishRawSchedule.js";
import createTasks from "functions/createTasks.js";
import {
  UserConcernType,
  PartEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
  ProgressImageType,
} from "types.js";
import {
  CreateRoutineAllSolutionsType,
  CreateRoutineUserInfoType,
} from "types/createRoutineTypes.js";
import { db } from "init.js";
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import getSolutionsAndFrequencies from "./getSolutionsAndFrequencies.js";
import { checkIfPublic } from "@/routes/checkIfPublic.js";

type Props = {
  userId: string;
  part: PartEnum;
  incrementMultiplier?: number;
  routineStartDate: string;
  partImages: ProgressImageType[];
  userInfo: CreateRoutineUserInfoType;
  partConcerns: UserConcernType[];
  specialConsiderations: string;
  allSolutions: CreateRoutineAllSolutionsType[];
  categoryName: CategoryNameEnum;
};

export default async function makeANewRoutine({
  userId,
  part,
  incrementMultiplier,
  routineStartDate,
  partImages,
  userInfo,
  allSolutions,
  partConcerns,
  categoryName,
  specialConsiderations,
}: Props) {
  try {
    const { demographics, timeZone } = userInfo;

    const allTasks = await doWithRetries(async () =>
      getSolutionsAndFrequencies({
        specialConsiderations,
        incrementMultiplier,
        demographics,
        partConcerns,
        allSolutions,
        categoryName,
        partImages,
        userId,
        part,
      })
    );

    const rawSchedule = await doWithRetries(async () =>
      getRawSchedule({
        allTasks,
        routineStartDate,
        days: 7,
      })
    );

    await incrementProgress({
      value: 1 * incrementMultiplier,
      operationKey: "routine",
      userId: String(userId),
    });

    const finalSchedule = await doWithRetries(async () =>
      polishRawSchedule({
        userId,
        part,
        concerns: partConcerns,
        categoryName,
        rawSchedule,
        incrementMultiplier,
        specialConsiderations,
      })
    );

    await incrementProgress({
      value: 2 * incrementMultiplier,
      operationKey: "routine",
      userId: String(userId),
    });

    let tasksToInsert = await doWithRetries(async () =>
      createTasks({
        part,
        allSolutions,
        finalSchedule,
        userInfo,
        categoryName,
      })
    );

    const { name: userName } = userInfo;

    const allTasksWithDateAndIds = addDateAndIdsToAllTasks({
      allTasksWithoutDates: allTasks,
      tasksToInsert,
    });

    const { minDate, maxDate } = getMinAndMaxRoutineDates(
      allTasksWithDateAndIds
    );

    const newRoutine = {
      userId: new ObjectId(userId),
      userName,
      part,
      concerns: partConcerns,
      finalSchedule,
      isPublic: false,
      status: RoutineStatusEnum.ACTIVE,
      createdAt: new Date(),
      allTasks: allTasksWithDateAndIds,
      startsAt: new Date(minDate),
      lastDate: new Date(maxDate),
    };

    newRoutine.isPublic = await checkIfPublic({
      userId,
      part,
    });

    const newRoutineObject = await doWithRetries(async () =>
      db.collection("Routine").insertOne(newRoutine)
    );

    tasksToInsert = tasksToInsert.map((rt) => ({
      ...rt,
      routineId: newRoutineObject.insertedId,
    }));

    if (tasksToInsert.length > 0)
      await doWithRetries(async () =>
        db.collection("Task").insertMany(tasksToInsert)
      );

    updateTasksAnalytics({
      userId,
      tasksToInsert,
      keyOne: "tasksCreated",
      keyTwo: "manualTasksCreated",
    });
  } catch (err) {
    throw httpError(err);
  }
}
