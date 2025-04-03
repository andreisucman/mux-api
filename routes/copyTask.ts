import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import {
  calculateDaysDifference,
  checkDateValidity,
  daysFrom,
} from "helpers/utils.js";
import sortTasksInScheduleByDate from "helpers/sortTasksInScheduleByDate.js";
import {
  AllTaskTypeWithIds,
  CustomRequest,
  RoutineStatusEnum,
  RoutineType,
  TaskStatusEnum,
  TaskType,
} from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import checkPurchaseAccess from "@/functions/checkPurchaseAccess.js";
import setToMidnight from "@/helpers/setToMidnight.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const {
      taskKey,
      routineId,
      ignoreInactiveTasks,
      startDate,
      timeZone,
      userName,
    } = req.body;

    const { isValidDate, isFutureDate } = checkDateValidity(
      startDate,
      timeZone
    );

    if (!taskKey || !routineId || !userName || !isValidDate || !isFutureDate) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { timeZone: 1, name: 1 },
      });

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      let taskInfo = (await doWithRetries(async () =>
        db
          .collection("Task")
          .find({ routineId: new ObjectId(routineId), key: taskKey })
          .sort({ expiresAt: 1 })
          .next()
      )) as unknown as TaskType;

      if (!taskInfo)
        throw httpError(
          `No task to add from user ${userName} to user ${req.userId} found.`
        );

      const hostRoutine = (await doWithRetries(async () =>
        db
          .collection("Routine")
          .findOne(
            { _id: new ObjectId(routineId) },
            { projection: { allTasks: 1 } }
          )
      )) as unknown as RoutineType;

      if (!hostRoutine) throw httpError(`${routineId} routine not found.`);

      const relevantAllTask = hostRoutine.allTasks.find(
        (allTask) => allTask.key === taskKey
      );

      const earliestTask = relevantAllTask.ids.sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      )[0];

      const differenceInDays = calculateDaysDifference(
        earliestTask.startsAt,
        setToMidnight({ date: startDate, timeZone })
      );

      const updatedIds = relevantAllTask.ids.filter((id) => {
        let criteria = !id.deletedOn;
        if (ignoreInactiveTasks) {
          criteria =
            criteria &&
            [TaskStatusEnum.COMPLETED, TaskStatusEnum.ACTIVE].includes(
              id.status
            );
        }
        return criteria;
      });

      const updatedAllTask = {
        ...relevantAllTask,
        ids: updatedIds.map((obj) => ({
          ...obj,
          _id: new ObjectId(),
          status: TaskStatusEnum.ACTIVE,
          startsAt: daysFrom({ date: obj.startsAt, days: differenceInDays }),
        })),
      };

      const part = taskInfo.part;
      const targetUserId = taskInfo.userId;

      const hasAccessTo = await checkPurchaseAccess({
        parts: [part],
        targetUserId: String(targetUserId),
        userId: req.userId,
      });

      if (!hasAccessTo.includes(part)) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      /* get the user's current routine */
      const currentRoutine = (await doWithRetries(async () =>
        db
          .collection("Routine")
          .find({
            userId: new ObjectId(req.userId),
            part,
            status: RoutineStatusEnum.ACTIVE,
          })
          .sort({ startsAt: 1 })
          .next()
      )) as unknown as RoutineType;

      /* reset personalized fields */
      taskInfo = {
        ...taskInfo,
        proofEnabled: true,
        completedAt: null,
        proofId: null,
        userName: userInfo.name,
        copiedFrom: userName,
        userId: new ObjectId(req.userId),
      };

      if (taskInfo.recipe) {
        taskInfo.name = taskInfo.recipe.name;
        taskInfo.description = taskInfo.recipe.description;
        taskInfo.instruction = taskInfo.recipe.instruction;
        taskInfo.productTypes = taskInfo.recipe.productTypes;
        taskInfo.examples = taskInfo.recipe.examples;
      }

      if (currentRoutine) {
        taskInfo.routineId = new ObjectId(currentRoutine._id);
      }

      const restDays = await doWithRetries(() =>
        db
          .collection("Task")
          .find(
            { _id: { $in: updatedIds.map((obj) => obj._id) } },
            { projection: { restDays: 1 } }
          )
          .toArray()
      );

      let draftTasks: TaskType[] = updatedAllTask.ids.map((obj) => {
        const relevantRestDay = restDays.find(
          (eObj) => String(eObj._id) === String(obj._id)
        );

        const newNextCanStartDate = daysFrom({
          date: obj.startsAt,
          days: relevantRestDay.restDays,
        });

        return {
          ...taskInfo,
          _id: obj._id,
          startsAt: obj.startsAt,
          status: obj.status,
          nextCanStartDate: newNextCanStartDate,
        };
      });

      let {
        concerns,
        allTasks: currentAllTasks,
        finalSchedule: currentFinalSchedule,
      } = currentRoutine || {};

      let finalSchedule: { [key: string]: ScheduleTaskType[] } =
        currentFinalSchedule || {};
      let allTasks: AllTaskTypeWithIds[] = currentAllTasks || [];

      /* update final schedule */
      for (let i = 0; i < draftTasks.length; i++) {
        const task = draftTasks[i];
        const dateString = new Date(task.startsAt).toDateString();

        const simpleTaskContent = {
          _id: task._id,
          key: task.key,
          concern: task.concern,
        };

        if (finalSchedule[dateString]) {
          finalSchedule[dateString].push(simpleTaskContent);
        } else {
          finalSchedule[dateString] = [simpleTaskContent];
        }
      }

      finalSchedule = sortTasksInScheduleByDate(finalSchedule);

      if (concerns) {
        /* update concerns */
        const newConcerns = draftTasks
          .filter((obj: TaskType) => !concerns.includes(obj.concern))
          .map((t) => t.concern);

        if (newConcerns.length > 0) {
          concerns.push(...newConcerns);
        }
      }

      allTasks.push(updatedAllTask);

      const { minDate, maxDate } = getMinAndMaxRoutineDates(allTasks);

      if (currentRoutine) {
        await doWithRetries(async () =>
          db.collection("Routine").updateOne(
            { _id: new ObjectId(currentRoutine._id) },
            {
              $set: {
                finalSchedule,
                allTasks,
                concerns,
                startsAt: new Date(minDate),
                lastDate: new Date(maxDate),
              },
            }
          )
        );
      } else {
        const routineId = new ObjectId();
        draftTasks = draftTasks.map((t) => ({ ...t, routineId }));

        await doWithRetries(async () =>
          db.collection("Routine").insertOne({
            _id: routineId,
            userId: new ObjectId(req.userId),
            allTasks,
            finalSchedule,
            part: taskInfo.part,
            concerns: [taskInfo.concern],
            status: RoutineStatusEnum.ACTIVE,
            startsAt: new Date(minDate),
            lastDate: new Date(maxDate),
            createdAt: new Date(),
            copiedFrom: userName,
            userName: userInfo.name,
          })
        );
      }

      await doWithRetries(async () =>
        db.collection("Task").insertMany(draftTasks)
      );

      updateTasksAnalytics({
        userId: req.userId,
        tasksToInsert: draftTasks,
        keyOne: "tasksCreated",
      });

      updateTasksAnalytics({
        userId: req.userId,
        tasksToInsert: draftTasks,
        keyOne: "tasksCloned",
        keyTwo: "manualTasksStolen",
      });

      res.status(200).json({
        message: draftTasks,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
