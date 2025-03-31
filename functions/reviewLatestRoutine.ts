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
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import { db } from "init.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import chooseSolutionsForConcerns, {
  ConcernsSolutionsAndFrequenciesType,
} from "./chooseSolutionsForConcerns.js";
import deactivatePreviousRoutineAndTasks from "./deactivatePreviousRoutineAndTasks.js";
import createSolutionData from "./createSolutionData.js";
import createScheduleAndTasks from "./createScheduleAndTasks.js";

type Props = {
  part: PartEnum;
  latestRoutineId: string;
  incrementMultiplier?: number;
  partImages: ProgressImageType[];
  partConcerns: UserConcernType[];
  userInfo: CreateRoutineUserInfoType;
  routineStartDate: string;
  latestSolutions: { [key: string]: number };
  categoryName: CategoryNameEnum;
};

export default async function reviewLatestRoutine({
  part,
  partImages,
  partConcerns,
  latestRoutineId,
  userInfo,
  latestSolutions,
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
    if (!latestRoutineId) throw httpError("No latest routineId");

    const { updatedListOfSolutions, areCurrentSolutionsOkay } =
      await chooseSolutionsForConcerns({
        userId: String(userId),
        part,
        timeZone,
        country,
        latestSolutions,
        categoryName,
        demographics,
        partConcerns,
        partImages,
        incrementMultiplier,
        specialConsiderations,
      });

    if (areCurrentSolutionsOkay) return;

    const { allSolutions: updatedAllSolutions, allTasks: updatedAllTasks } =
      await createSolutionData({
        categoryName,
        concernsSolutionsAndFrequencies:
          updatedListOfSolutions as unknown as ConcernsSolutionsAndFrequenciesType,
        part,
        userId: String(userId),
      });

    const { allTasksWithDateAndIds, finalSchedule, tasksToInsert } =
      await createScheduleAndTasks({
        part,
        userInfo,
        allSolutions: updatedAllSolutions,
        allTasks: updatedAllTasks,
        categoryName,
        incrementMultiplier,
        partConcerns,
        routineStartDate,
        specialConsiderations,
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

    const tasksToInsertWithRoutineId = tasksToInsert.map((rt) => ({
      ...rt,
      routineId: newRoutineObject.insertedId,
    }));

    if (tasksToInsert.length > 0)
      await doWithRetries(async () =>
        db.collection("Task").insertMany(tasksToInsertWithRoutineId)
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
