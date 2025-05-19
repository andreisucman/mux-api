import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  UserConcernType,
  PartEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
  RoutineType,
} from "types.js";
import { CreateRoutineUserInfoType } from "types/createRoutineTypes.js";
import { db } from "init.js";
import httpError from "helpers/httpError.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import createSolutionData from "./createSolutionData.js";
import createScheduleAndTasks from "./createScheduleAndTasks.js";
import { checkIfPublic } from "@/routes/checkIfPublic.js";
import { RoutineSuggestionTaskType } from "@/types/updateRoutineSuggestionTypes.js";
import createRoutineData from "./createRoutineData.js";

type Props = {
  userId: string;
  part: PartEnum;
  routineStartDate: string;
  userInfo: CreateRoutineUserInfoType;
  partConcerns: UserConcernType[];
  categoryName: CategoryNameEnum;
  suggestedTasks: { [concern: string]: RoutineSuggestionTaskType[] };
};

export default async function makeANewRoutine({
  userId,
  part,
  routineStartDate,
  suggestedTasks,
  userInfo,
  partConcerns,
  categoryName,
}: Props) {
  try {
    const { name: userName } = userInfo;

    const { allSolutions, allTasks } = await createSolutionData({
      categoryName,
      suggestedTasks,
      part,
      userId: String(userId),
    });

    const { allTasksWithDateAndIds, tasksToInsert } =
      await createScheduleAndTasks({
        allSolutions,
        allTasks,
        categoryName,
        part,
        partConcerns,
        routineStartDate,
        userInfo,
      });

    const { minDate, maxDate } = getMinAndMaxRoutineDates(
      allTasksWithDateAndIds
    );

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

    const newRoutineObject = await doWithRetries(async () =>
      db.collection("Routine").insertOne(newRoutine)
    );

    const tasksToInsertWithRoutineId = tasksToInsert.map((rt) => ({
      ...rt,
      routineId: newRoutineObject.insertedId,
    }));

    if (tasksToInsert.length > 0)
      await doWithRetries(async () =>
        db.collection("Task").insertMany(tasksToInsertWithRoutineId)
      );

    const routineDataPromises = concernNames.map((concern) =>
      createRoutineData({
        part,
        concern,
        userId: new ObjectId(userId),
        userName,
      })
    );

    await Promise.all(routineDataPromises);

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
