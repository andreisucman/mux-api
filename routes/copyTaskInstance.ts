import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, RoutineStatusEnum, RoutineType, TaskStatusEnum, TaskType } from "types.js";
import { checkDateValidity, daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import combineAllTasks from "@/helpers/combineAllTasks.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import { db } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import httpError from "@/helpers/httpError.js";
import { addTaskToSchedule } from "@/helpers/rescheduleTaskHelpers.js";
import getClosestRoutine from "@/functions/getClosestRoutine.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskId, startDate, userName, returnTask } = req.body;

  const { isValidDate, isFutureDate } = checkDateValidity(startDate, req.timeZone);

  if (!isValidDate || !isFutureDate || !ObjectId.isValid(taskId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({ userId: req.userId, projection: { name: 1 } });

    const currentTask = (await doWithRetries(async () =>
      db.collection("Task").findOne({ _id: new ObjectId(taskId) }, { projection: { _id: 0 } })
    )) as unknown as TaskType;

    if (!currentTask) throw httpError(`Task ${taskId} not found.`);

    const projection = {
      allTasks: 1,
      finalSchedule: 1,
      lastDate: 1,
      concerns: 1,
    };

    const midnightStartDate = setToMidnight({ date: startDate, timeZone: req.timeZone });

    let targetRoutine = (await doWithRetries(async () =>
      db
        .collection("Routine")
        .find({
          userId: new ObjectId(req.userId),
          part: currentTask.part,
          status: RoutineStatusEnum.ACTIVE,
          startsAt: { $lte: new Date(midnightStartDate) },
          lastDate: { $gte: new Date(midnightStartDate) },
        })
        .project(projection)
        .sort({ startsAt: 1 })
        .next()
    )) as unknown as RoutineType;

    if (!targetRoutine) {
      targetRoutine = await getClosestRoutine(
        {
          userId: new ObjectId(req.userId),
          part: currentTask.part,
          status: RoutineStatusEnum.ACTIVE,
        },
        startDate
      );
    }

    const { allTasks, concerns, finalSchedule } = targetRoutine || {};

    const newStartsAt = setToMidnight({
      date: new Date(startDate),
      timeZone: req.timeZone,
    });

    const newExpiresAt = daysFrom({
      date: new Date(newStartsAt),
      days: 1,
    });

    const resetTask: TaskType = {
      ...currentTask,
      _id: new ObjectId(),
      userId: new ObjectId(req.userId),
      startsAt: newStartsAt,
      expiresAt: newExpiresAt,
      proofId: null,
      completedAt: null,
      status: TaskStatusEnum.ACTIVE,
      userName: userInfo.name,
      copiedFrom: userName,
    };

    if (resetTask.recipe) {
      resetTask.recipe = {
        ...resetTask.recipe,
        canPersonalize: true,
      };
    }

    const newAllTaskRecord = {
      ids: [
        {
          _id: resetTask._id,
          startsAt: newStartsAt,
          status: TaskStatusEnum.ACTIVE,
        },
      ],
      name: resetTask.name,
      icon: resetTask.icon,
      color: resetTask.color,
      key: resetTask.key,
      concern: resetTask.concern,
      description: resetTask.description,
      instruction: resetTask.instruction,
      total: 1,
    };

    let updatedSchedule = addTaskToSchedule(finalSchedule, resetTask.key, resetTask.concern, newAllTaskRecord.ids);
    updatedSchedule = sortTasksInScheduleByDate(updatedSchedule);

    let finalRoutineAllTasks = combineAllTasks({
      oldAllTasks: allTasks,
      newAllTasks: [newAllTaskRecord],
    });
    if (!finalRoutineAllTasks.length) finalRoutineAllTasks = [newAllTaskRecord];

    const { minDate, maxDate } = getMinAndMaxRoutineDates(finalRoutineAllTasks);

    let updateRoutineId;
    if (targetRoutine) {
      updateRoutineId = targetRoutine._id;

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(targetRoutine._id) },
          {
            $set: {
              finalSchedule: updatedSchedule,
              allTasks: finalRoutineAllTasks,
              concerns: [...new Set([...(concerns || []), resetTask.concern])],
              startsAt: new Date(minDate),
              lastDate: new Date(maxDate),
            },
          }
        )
      );
    } else {
      updateRoutineId = new ObjectId();
      resetTask.routineId = updateRoutineId;

      await doWithRetries(async () =>
        db.collection("Routine").insertOne({
          _id: updateRoutineId,
          userId: new ObjectId(req.userId),
          allTasks: finalRoutineAllTasks,
          finalSchedule: updatedSchedule,
          part: resetTask.part,
          concerns: [resetTask.concern],
          status: RoutineStatusEnum.ACTIVE,
          startsAt: new Date(minDate),
          lastDate: new Date(maxDate),
          createdAt: new Date(),
          copiedFrom: userName,
          userName: userInfo.name,
        })
      );
    }

    await doWithRetries(async () => db.collection("Task").insertOne(resetTask));

    let result: { [key: string]: any } = {};

    const updatedRoutine = await doWithRetries(() =>
      db.collection("Routine").findOne({ _id: new ObjectId(updateRoutineId) })
    );

    if (updatedRoutine) result.routine = updatedRoutine;
    if (returnTask) result.newTask = resetTask;

    res.status(200).json({
      message: result,
    });
  } catch (err) {
    next(err);
  }
});

export default route;
