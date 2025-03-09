import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { daysFrom, calculateDaysDifference } from "helpers/utils.js";
import {
  UserConcernType,
  TaskStatusEnum,
  TaskType,
  PartEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
  ProgressImageType,
} from "types.js";
import addAdditionalTasks from "functions/addAdditionalTasks.js";
import deactivatePreviousRoutineAndTasks from "functions/deactivatePreviousRoutineAndTasks.js";
import {
  CreateRoutineAllSolutionsType,
  CreateRoutineUserInfoType,
} from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import { db } from "init.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";

type Props = {
  part: PartEnum;
  incrementMultiplier?: number;
  routineStartDate: string;
  partImages: ProgressImageType[];
  categoryName: CategoryNameEnum;
  partConcerns: UserConcernType[];
  tasksToProlong: TaskType[];
  allSolutions: CreateRoutineAllSolutionsType[];
  userInfo: CreateRoutineUserInfoType;
  latestCompletedTasks: { [key: string]: any };
};

export default async function prolongPreviousRoutine({
  part,
  partImages,
  partConcerns,
  categoryName,
  allSolutions,
  userInfo,
  incrementMultiplier = 1,
  routineStartDate,
  tasksToProlong,
  latestCompletedTasks,
}: Props) {
  const { _id: userId, name: userName } = userInfo;

  try {
    if (!tasksToProlong || tasksToProlong.length === 0)
      throw httpError("No tasks to prolong");

    const firstTask = tasksToProlong[0];
    const previousRoutineId = firstTask.routineId;

    const daysDifference = calculateDaysDifference(
      firstTask.startsAt,
      new Date(routineStartDate)
    );

    const resetTasks: TaskType[] = [];

    /* reset fields */
    const concernsList = partConcerns.map((obj) => obj.name);

    for (const draft of tasksToProlong) {
      const { _id, ...rest } = draft;

      if (!concernsList.includes(rest.concern)) continue; // if the task is not required based on the latest concerns skip prolonging it

      const startsAt = daysFrom({
        date: rest.startsAt,
        days: daysDifference,
      });

      const expiresAt = daysFrom({ date: startsAt, days: 1 });

      const updatedTask: TaskType = {
        ...rest,
        _id: new ObjectId(),
        status: TaskStatusEnum.ACTIVE,
        startsAt,
        expiresAt,
        part,
        completedAt: null,
      };

      if (rest.recipe) {
        updatedTask.recipe = { ...rest.recipe, canPersonalize: true };
      }

      resetTasks.push(updatedTask);
    }

    const dateKeys = resetTasks.map((task) => ({
      _id: task._id,
      key: task.key,
      concern: task.concern,
      startsAt: task.startsAt.toDateString(),
      completedAt: null as Date | null,
    }));

    const schedule = dateKeys.reduce(
      (acc: { [key: string]: ScheduleTaskType[] }, obj) => {
        if (acc[obj.startsAt]) {
          acc[obj.startsAt].push({
            key: obj.key,
            concern: obj.concern,
          });
        } else {
          acc[obj.startsAt] = [{ key: obj.key, concern: obj.concern }];
        }
        return acc;
      },
      {}
    );

    const uniqueKeys = [...new Set(resetTasks.map((t) => t.key))];

    const allTasks = uniqueKeys
      .map((key) => {
        const task = resetTasks.find((t) => t.key === key);
        if (!task) return null;

        const ids = resetTasks
          .filter((t) => t.key === key)
          .map((t) => ({
            _id: t._id,
            startsAt: t.startsAt,
            status: TaskStatusEnum.ACTIVE,
          }));

        return {
          ids,
          key: task.key,
          name: task.name,
          icon: task.icon,
          color: task.color,
          concern: task.concern,
          part: task.part,
          instruction: task.instruction,
          description: task.description,
          total: resetTasks.filter((t) => t.key === task.key).length,
          completed: 0,
          unknown: 0,
        };
      })
      .filter(Boolean);

    await deactivatePreviousRoutineAndTasks(String(previousRoutineId));

    const { additionalAllTasks, tasksToInsert, mergedSchedule } =
      await addAdditionalTasks({
        part,
        userInfo,
        routineStartDate,
        partImages,
        categoryName,
        allSolutions,
        partConcerns,
        currentTasks: resetTasks,
        currentSchedule: schedule,
        latestCompletedTasks,
        incrementMultiplier,
      });

    const finalRoutineAllTasks = combineAllTasks({
      oldAllTasks: allTasks,
      newAllTasks: additionalAllTasks,
    });

    const finalSchedule = mergedSchedule;

    const { minDate, maxDate } = getMinAndMaxRoutineDates(finalRoutineAllTasks);

    const newRoutineObject = await doWithRetries(async () =>
      db.collection("Routine").insertOne({
        userId: new ObjectId(userId),
        userName,
        finalSchedule,
        concerns: partConcerns,
        status: RoutineStatusEnum.ACTIVE,
        createdAt: new Date(),
        startsAt: new Date(minDate),
        lastDate: new Date(maxDate),
        allTasks: finalRoutineAllTasks,
        part,
      })
    );

    /* update final tasks */
    const finalTasks = tasksToInsert.map((rt, i) => ({
      ...rt,
      routineId: newRoutineObject.insertedId,
    }));

    console.log(
      "finalTasks",
      finalTasks.map((t) => t._id)
    );

    if (finalTasks.length > 0) {
      const insertedResponse = await doWithRetries(async () =>
        db.collection("Task").insertMany(finalTasks)
      );

      console.log("insertedResponse", insertedResponse);
    }

    updateTasksAnalytics({
      userId: String(userId),
      tasksToInsert: finalTasks,
      keyOne: "tasksCreated",
      keyTwo: "manualTasksCreated",
    });
  } catch (err) {
    throw httpError(err);
  }
}
