import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import getRawSchedule from "functions/getRawSchedule.js";
import polishRawSchedule from "functions/polishRawSchedule.js";
import createTasks from "functions/createTasks.js";
import getSolutionsAndFrequencies from "functions/getSolutionsAndFrequencies.js";
import deactivatePreviousRoutineAndTasks from "functions/deactivatePreviousRoutineAndTasks.js";
import {
  UserConcernType,
  PartEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
  ProgressImageType,
} from "types.js";
import {
  CreateRoutineUserInfoType,
  CreateRoutineAllSolutionsType,
} from "types/createRoutineTypes.js";
import { db } from "init.js";
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";

type Props = {
  userId: string;
  part: PartEnum;
  routineStartDate: string;
  partImages: ProgressImageType[];
  userInfo: CreateRoutineUserInfoType;
  partConcerns: UserConcernType[];
  specialConsiderations: string;
  categoryName: CategoryNameEnum;
  allSolutions: CreateRoutineAllSolutionsType[];
};

export default async function makeANewRoutine({
  userId,
  part,
  routineStartDate,
  partImages,
  userInfo,
  partConcerns,
  categoryName,
  specialConsiderations,
  allSolutions,
}: Props) {
  try {
    const solutionsAndFrequencies = await doWithRetries(async () =>
      getSolutionsAndFrequencies({
        specialConsiderations,
        demographics: userInfo.demographics,
        partConcerns,
        allSolutions,
        categoryName,
        partImages,
        userId,
        part,
      })
    );

    await incrementProgress({
      value: 1,
      operationKey: "routine",
      userId: String(userId),
    });

    const rawSchedule = await doWithRetries(async () =>
      getRawSchedule({
        solutionsAndFrequencies,
        routineStartDate,
        days: 6,
      })
    );

    await incrementProgress({
      value: 2,
      operationKey: "routine",
      userId: String(userId),
    });

    const finalSchedule = await doWithRetries(async () =>
      polishRawSchedule({
        userId,
        concerns: partConcerns,
        categoryName,
        rawSchedule,
        specialConsiderations,
      })
    );

    await incrementProgress({
      value: 2,
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
      allTasksWithoutDates: solutionsAndFrequencies,
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
      keyTwo: "manuallyTasksCreated",
    });
  } catch (err) {
    throw httpError(err);
  }
}
