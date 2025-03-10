import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getRawSchedule from "functions/getRawSchedule.js";
import polishRawSchedule from "functions/polishRawSchedule.js";
import createTasks from "functions/createTasks.js";
import deactivatePreviousRoutineAndTasks from "functions/deactivatePreviousRoutineAndTasks.js";
import {
  UserConcernType,
  PartEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
  ProgressImageType,
} from "types.js";
import { CreateRoutineUserInfoType } from "types/createRoutineTypes.js";
import { db } from "init.js";
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import createSolutionData from "./createSolutionData.js";
import chooseSolutionsForConcerns from "./chooseSolutionsForConcerns.js";

type Props = {
  userId: string;
  part: PartEnum;
  incrementMultiplier?: number;
  routineStartDate: string;
  partImages: ProgressImageType[];
  userInfo: CreateRoutineUserInfoType;
  partConcerns: UserConcernType[];
  specialConsiderations: string;
  categoryName: CategoryNameEnum;
};

export default async function makeANewRoutine({
  userId,
  part,
  incrementMultiplier,
  routineStartDate,
  partImages,
  userInfo,
  partConcerns,
  categoryName,
  specialConsiderations,
}: Props) {
  try {
    const { demographics, timeZone, country } = userInfo;

    const { concernsSolutionsAndFrequencies } = await chooseSolutionsForConcerns({
      userId: String(userId),
      part,
      timeZone,
      country,
      categoryName,
      demographics,
      partConcerns,
      partImages,
      incrementMultiplier,
      specialConsiderations,
    });

    const { allSolutions, allTasks } = await createSolutionData({
      categoryName,
      concernsSolutionsAndFrequencies,
      part,
      userId: String(userId),
    });

    const rawSchedule = await doWithRetries(async () =>
      getRawSchedule({
        allTasks,
        routineStartDate,
        days: 7,
        timeZone,
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

    const previousRoutineRecord = await doWithRetries(async () =>
      db
        .collection("Routine")
        .find(
          { userId: new ObjectId(userId), part },
          {
            projection: {
              _id: 1,
            },
          }
        )
        .sort({ createdAt: -1 })
        .next()
    );

    if (previousRoutineRecord)
      await deactivatePreviousRoutineAndTasks(
        String(previousRoutineRecord._id)
      );

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

    const newRoutineObject = await doWithRetries(async () =>
      db.collection("Routine").insertOne({
        userId: new ObjectId(userId),
        userName,
        concerns: partConcerns,
        finalSchedule,
        status: RoutineStatusEnum.ACTIVE,
        createdAt: new Date(),
        allTasks: allTasksWithDateAndIds,
        startsAt: new Date(minDate),
        lastDate: new Date(maxDate),
        part,
      })
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
