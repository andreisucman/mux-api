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
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import { db } from "init.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import chooseSolutionsForConcerns, { ConcernsSolutionsAndFrequenciesType } from "./chooseSolutionsForConcerns.js";
import createSolutionData from "./createSolutionData.js";
import createScheduleAndTasks from "./createScheduleAndTasks.js";
import { checkIfPublic } from "@/routes/checkIfPublic.js";

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
    latestConcernScores,
  } = userInfo;

  try {
    if (!latestRoutineId) throw httpError("No latest routineId");

    const partScores = latestConcernScores[part];

    const { updatedListOfSolutions, areCurrentSolutionsOkay } = await chooseSolutionsForConcerns({
      userId: String(userId),
      part,
      timeZone,
      country,
      latestSolutions,
      categoryName,
      demographics,
      partConcerns,
      partImages,
      partScores,
      incrementMultiplier,
      specialConsiderations,
    });

    if (areCurrentSolutionsOkay) return;

    const { allSolutions: updatedAllSolutions, allTasks: updatedAllTasks } = await createSolutionData({
      categoryName,
      concernsSolutionsAndFrequencies: updatedListOfSolutions as unknown as ConcernsSolutionsAndFrequenciesType,
      part,
      userId: String(userId),
    });

    const { allTasksWithDateAndIds, tasksToInsert } = await createScheduleAndTasks({
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
      userId: String(userId),
      tasksToInsert,
      keyOne: "tasksCreated",
      keyTwo: "manualTasksCreated",
    });
  } catch (err) {
    throw httpError(err);
  }
}
