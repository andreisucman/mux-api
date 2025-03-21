import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
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
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import createSolutionData from "./createSolutionData.js";
import chooseSolutionsForConcerns from "./chooseSolutionsForConcerns.js";
import createScheduleAndTasks from "./createScheduleAndTasks.js";

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

    const { concernsSolutionsAndFrequencies } =
      await chooseSolutionsForConcerns({
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

    const { allTasksWithDateAndIds, finalSchedule, tasksToInsert } =
      await createScheduleAndTasks({
        allSolutions,
        allTasks,
        categoryName,
        incrementMultiplier,
        part,
        partConcerns,
        routineStartDate,
        userInfo,
        specialConsiderations,
      });

    const { minDate, maxDate } = getMinAndMaxRoutineDates(
      allTasksWithDateAndIds
    );

    const { name: userName } = userInfo;

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

    const tasksToInsertWithRoutineId = tasksToInsert.map((rt) => ({
      ...rt,
      routineId: newRoutineObject.insertedId,
    }));

    if (tasksToInsert.length > 0)
      await doWithRetries(async () =>
        db.collection("Task").insertMany(tasksToInsertWithRoutineId)
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
