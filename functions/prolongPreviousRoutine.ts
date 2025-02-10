import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { daysFrom, calculateDaysDifference } from "helpers/utils.js";
import {
  UserConcernType,
  TaskStatusEnum,
  TaskType,
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

type Props = {
  images: ProgressImageType[];
  categoryName: CategoryNameEnum;
  concerns: UserConcernType[];
  tasksToProlong: TaskType[];
  allSolutions: CreateRoutineAllSolutionsType[];
  userInfo: CreateRoutineUserInfoType;
};

export default async function prolongPreviousRoutine({
  images,
  concerns,
  categoryName,
  allSolutions,
  userInfo,
  tasksToProlong,
}: Props) {
  const { _id: userId, name: userName } = userInfo;

  try {
    if (!tasksToProlong || tasksToProlong.length === 0)
      throw httpError("No tasks to prolong");

    const firstTask = tasksToProlong[0];
    const previousRoutineId = firstTask.routineId;

    const daysDifference = calculateDaysDifference(
      firstTask.startsAt,
      new Date()
    );

    const resetTasks: TaskType[] = [];

    /* reset fields */
    const concernsList = concerns.map((obj) => obj.name);

    for (const draft of tasksToProlong) {
      const { _id, ...rest } = draft;

      const revisionRequired = new Date() > new Date(rest.revisionDate);
      if (revisionRequired) {
        if (!concernsList.includes(rest.concern)) continue; // if the task is not required based on the latest concerns skip it
      }

      const startsAt = daysFrom({
        date: rest.startsAt,
        days: daysDifference - 1,
      });

      const expiresAt = daysFrom({ date: startsAt, days: 1 });

      const updatedTask: TaskType = {
        ...rest,
        _id: new ObjectId(),
        status: TaskStatusEnum.ACTIVE,
        startsAt,
        expiresAt,
        isSubmitted: false,
      };

      const recipe = rest.recipe;

      if (recipe) {
        updatedTask.recipe = { ...recipe, canPersonalize: true };
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

    const { additionalAllTasks, additionalTasksToInsert, mergedSchedule } =
      await addAdditionalTasks({
        userInfo,
        images,
        categoryName,
        allSolutions,
        concerns,
        currentTasks: resetTasks,
        currentSchedule: schedule,
      });

    const finalRoutineAllTasks = combineAllTasks({
      oldAllTasks: allTasks,
      newAllTasks: additionalAllTasks,
    });

    const finalTasksToInsert = [...resetTasks, ...additionalTasksToInsert];
    const finalSchedule = mergedSchedule;

    /* add the new routine object */
    const dates = Object.keys(finalSchedule);
    const lastDate = dates[dates.length - 1];

    const newRoutineObject = await doWithRetries(async () =>
      db.collection("Routine").insertOne({
        userId: new ObjectId(userId),
        userName,
        finalSchedule,
        concerns: concerns,
        status: RoutineStatusEnum.ACTIVE,
        createdAt: new Date(),
        lastDate: new Date(lastDate),
        allTasks: finalRoutineAllTasks,
      })
    );

    /* update final tasks */
    const finalTasks = finalTasksToInsert.map((rt, i) => ({
      ...rt,
      routineId: newRoutineObject.insertedId,
    }));

    if (finalTasks.length > 0)
      await doWithRetries(async () =>
        db.collection("Task").insertMany(finalTasks)
      );

    updateTasksAnalytics({
      userId: String(userId),
      tasksToInsert: finalTasks,
      keyOne: "tasksCreated",
      keyTwo: "manuallyTasksCreated",
    });
  } catch (err) {
    throw httpError(err);
  }
}
