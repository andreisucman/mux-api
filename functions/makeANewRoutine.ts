import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  UserConcernType,
  PartEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
  ProgressImageType,
  RoutineType,
} from "types.js";
import { CreateRoutineUserInfoType } from "types/createRoutineTypes.js";
import { db } from "init.js";
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import createSolutionData from "./createSolutionData.js";
import chooseSolutionsForConcerns from "./chooseSolutionsForConcerns.js";
import createScheduleAndTasks from "./createScheduleAndTasks.js";
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
    const { demographics, name: userName, timeZone, country } = userInfo;

    console.log("userInfo time zone", timeZone)

    const { updatedListOfSolutions } = await chooseSolutionsForConcerns({
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
      concernsSolutionsAndFrequencies: updatedListOfSolutions,
      part,
      userId: String(userId),
    });

    const { allTasksWithDateAndIds, finalSchedule, tasksToInsert } = await createScheduleAndTasks({
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

    const { minDate, maxDate } = getMinAndMaxRoutineDates(allTasksWithDateAndIds);

    const concernNames = partConcerns.map((c) => c.name);

    const isPublicResponse = await checkIfPublic({
      userId: String(userId),
      concerns: concernNames,
    });

    const newRoutine: RoutineType = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      userName,
      concerns: concernNames,
      finalSchedule,
      status: RoutineStatusEnum.ACTIVE,
      createdAt: new Date(),
      allTasks: allTasksWithDateAndIds,
      startsAt: new Date(minDate),
      lastDate: new Date(maxDate),
      part,
      isPublic: isPublicResponse.isPublic,
    };

    const newRoutineObject = await doWithRetries(async () => db.collection("Routine").insertOne(newRoutine));

    const tasksToInsertWithRoutineId = tasksToInsert.map((rt) => ({
      ...rt,
      routineId: newRoutineObject.insertedId,
    }));

    if (tasksToInsert.length > 0)
      await doWithRetries(async () => db.collection("Task").insertMany(tasksToInsertWithRoutineId));

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
