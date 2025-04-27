import doWithRetries from "@/helpers/doWithRetries.js";
import getRawSchedule from "./getRawSchedule.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import polishRawSchedule from "./polishRawSchedule.js";
import createTasks from "./createTasks.js";
import addDateAndIdsToAllTasks from "@/helpers/addDateAndIdsToAllTasks.js";
import { AllTaskType, CategoryNameEnum, PartEnum, UserConcernType } from "@/types.js";
import { CreateRoutineAllSolutionsType, CreateRoutineUserInfoType } from "@/types/createRoutineTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  categoryName: CategoryNameEnum;
  part: PartEnum;
  partConcerns: UserConcernType[];
  allTasks: AllTaskType[];
  routineStartDate: string;
  userInfo: CreateRoutineUserInfoType;
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
      value: 5,
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
      allTasksWithDateAndIds,
      tasksToInsert,
    };
  } catch (err) {
    throw httpError(err);
  }
}
