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

type Props = {
  userId: string;
  images: ProgressImageType[];
  userInfo: CreateRoutineUserInfoType;
  concerns: UserConcernType[];
  specialConsiderations: string;
  categoryName: CategoryNameEnum;
  allSolutions: CreateRoutineAllSolutionsType[];
};

export default async function makeANewRoutine({
  userId,
  images,
  userInfo,
  concerns,
  categoryName,
  specialConsiderations,
  allSolutions,
}: Props) {
  try {
    const solutionsAndFrequencies = await doWithRetries(async () =>
      getSolutionsAndFrequencies({
        specialConsiderations,
        demographics: userInfo.demographics,
        concerns,
        allSolutions,
        categoryName,
        images,
        userId,
      })
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "routine" },
          { $inc: { progress: 10 } }
        )
    );

    const rawSchedule = await doWithRetries(async () =>
      getRawSchedule({
        solutionsAndFrequencies,
        concerns: concerns,
        days: 6,
      })
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "routine" },
          { $inc: { progress: 5 } }
        )
    );

    const finalSchedule = await doWithRetries(async () =>
      polishRawSchedule({
        userId,
        concerns: concerns,
        categoryName,
        rawSchedule,
        specialConsiderations,
      })
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: "routine" },
          { $inc: { progress: 5 } }
        )
    );

    const previousRoutineRecord = await doWithRetries(async () =>
      db
        .collection("Routine")
        .find(
          { userId: new ObjectId(userId) },
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
        allSolutions,
        finalSchedule,
        userInfo,
        categoryName,
      })
    );

    const dates = Object.keys(finalSchedule);
    const lastDate = dates[dates.length - 1];

    const { name: userName } = userInfo;

    const allTasksWithDateAndIds = addDateAndIdsToAllTasks({
      allTasksWithoutDates: solutionsAndFrequencies,
      tasksToInsert,
    });

    const newRoutineObject = await doWithRetries(async () =>
      db.collection("Routine").insertOne({
        userId: new ObjectId(userId),
        userName,
        concerns,
        finalSchedule,
        status: RoutineStatusEnum.ACTIVE,
        createdAt: new Date(),
        allTasks: allTasksWithDateAndIds,
        lastDate: new Date(lastDate),
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
