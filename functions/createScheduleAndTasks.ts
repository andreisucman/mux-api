import doWithRetries from "@/helpers/doWithRetries.js";
import getRawSchedule from "./getRawSchedule.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import polishRawSchedule from "./polishRawSchedule.js";
import createTasks from "./createTasks.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import { AllTaskType, CategoryNameEnum, PartEnum, UserConcernType, UserInfoType } from "@/types.js";
import { CreateRoutineAllSolutionsType } from "@/types/createRoutineTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  categoryName: CategoryNameEnum;
  part: PartEnum;
  specialConsiderations?: string;
  partConcerns: UserConcernType[];
  allTasks: AllTaskType[];
  routineStartDate: string;
  incrementMultiplier: number;
  userInfo: UserInfoType;
  allSolutions: CreateRoutineAllSolutionsType[];
};

export default async function createScheduleAndTasks({
  part,
  userInfo,
  allSolutions,
  categoryName,
  partConcerns,
  allTasks,
  routineStartDate,
  specialConsiderations,
  incrementMultiplier,
}: Props) {
  try {
    const rawSchedule = await doWithRetries(async () =>
      getRawSchedule({
        allTasks,
        routineStartDate,
        days: 7,
        timeZone: userInfo.timeZone,
      })
    );

    await incrementProgress({
      value: 5 * incrementMultiplier,
      operationKey: "routine",
      userId: String(userInfo._id),
    });

    const finalSchedule = await doWithRetries(async () =>
      polishRawSchedule({
        userId: String(userInfo._id),
        part,
        concerns: partConcerns,
        categoryName,
        rawSchedule,
        incrementMultiplier,
        specialConsiderations,
      })
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

    const allTasksWithDateAndIds = addDateAndIdsToAllTasks({
      allTasksWithoutDates: allTasks,
      tasksToInsert,
    });

    return {
      finalSchedule,
      allTasksWithDateAndIds,
      tasksToInsert,
    };
  } catch (err) {
    throw httpError(err);
  }
}
