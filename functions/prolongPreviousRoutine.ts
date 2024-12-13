import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { daysFrom, calculateDaysDifference } from "helpers/utils.js";
import {
  RequiredSubmissionType,
  UserConcernType,
  TaskStatusEnum,
  TaskType,
  TypeEnum,
  PartEnum,
} from "types.js";
import addAdditionalTasks from "functions/addAdditionalTasks.js";
import deactivatePreviousRoutineAndTasks from "functions/deactivatePreviousRoutineAndTasks.js";
import {
  CreateRoutineAllSolutionsType,
  CreateRoutineUserInfoType,
} from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import { db } from "init.js";

type Props = {
  type: TypeEnum;
  part: PartEnum;
  concerns: UserConcernType[];
  tasksToProlong: TaskType[];
  allSolutions: CreateRoutineAllSolutionsType[];
  userInfo: CreateRoutineUserInfoType;
};

export default async function prolongPreviousRoutine({
  type,
  part,
  concerns,
  allSolutions,
  userInfo,
  tasksToProlong,
}: Props) {
  const { _id: userId } = userInfo;

  try {
    if (!tasksToProlong || tasksToProlong.length === 0)
      throw new Error("No tasks to prolong");

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
        status: "active" as TaskStatusEnum,
        productsPersonalized: false,
        suggestions: [],
        startsAt,
        expiresAt,
        type,
        part,
      };

      const recipe = rest.recipe;

      if (recipe) {
        updatedTask.recipe = { ...recipe, canPersonalize: true };
      }

      updatedTask.requiredSubmissions = updatedTask.requiredSubmissions.map(
        (obj: RequiredSubmissionType) => ({ ...obj, isSubmitted: false })
      );

      resetTasks.push(updatedTask);
    }

    const dateKeys = resetTasks.map((task) => ({
      key: task.key,
      concern: task.concern,
      startsAt: task.startsAt.toDateString(),
    }));

    const schedule = dateKeys.reduce(
      (acc: { [key: string]: { key: string; concern: string }[] }, obj) => {
        if (acc[obj.startsAt]) {
          acc[obj.startsAt].push({ key: obj.key, concern: obj.concern });
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

        return {
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

    let finalRoutineAllTasks;
    let finalTasksToInsert;
    let finalSchedule = {};

    if (resetTasks.length < 20) {
      const { additionalAllTasks, additionalTasksToInsert, mergedSchedule } =
        await addAdditionalTasks({
          allSolutions,
          concerns,
          userInfo,
          type,
          part,
          currentTasks: resetTasks,
          currentSchedule: schedule,
        });

      finalRoutineAllTasks = [...allTasks, ...additionalAllTasks];
      finalTasksToInsert = [...resetTasks, ...additionalTasksToInsert];
      finalSchedule = mergedSchedule;
    }

    /* add the new routine object */
    const dates = Object.keys(finalSchedule);
    const lastDate = dates[dates.length - 1];

    const newRoutineObject = await doWithRetries(async () =>
      db.collection("Routine").insertOne({
        userId: new ObjectId(userId),
        concerns,
        finalSchedule,
        status: "active",
        createdAt: new Date(),
        lastDate: new Date(lastDate),
        allTasks,
        type,
        part,
      })
    );

    /* update final tasks */
    const finalTasks = finalTasksToInsert.map((rt, i) => ({
      ...rt,
      routineId: newRoutineObject.insertedId,
    }));

    await doWithRetries(async () =>
      db.collection("Task").insertMany(finalTasks)
    );
  } catch (err) {
    throw httpError(err);
  }
}
