import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import { checkDateValidity, daysFrom } from "helpers/utils.js";
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

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskKey, routineId, startDate, total, timeZone, userName } =
      req.body;

    const { isValidDate, isFutureDate } = checkDateValidity(
      startDate,
      timeZone
    );

    if (
      !taskKey ||
      !routineId ||
      !total ||
      !userName ||
      !isValidDate ||
      !isFutureDate
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { timeZone: 1, name: 1 },
      });

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      const { timeZone } = userInfo;

      let taskToAdd = (await doWithRetries(async () =>
        db
          .collection("Task")
          .find({ routineId: new ObjectId(routineId), key: taskKey })
          .sort({ expiresAt: -1 })
          .next()
      )) as unknown as TaskType;

      if (!taskToAdd)
        throw httpError(
          `No task to add from user ${userName} to user ${req.userId} found.`
        );

      const part = taskToAdd[0].part;
      const targetUserId = taskToAdd[0].userId;

      const hasAccessTo = await checkPurchaseAccess({
        parts: [part],
        targetUserId,
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
            part: taskToAdd.part,
            status: RoutineStatusEnum.ACTIVE,
          })
          .next()
      )) as unknown as RoutineType;

      /* reset personalized fields */
      taskToAdd = {
        ...taskToAdd,
        proofEnabled: true,
        completedAt: null,
        userName: userInfo.name,
        stolenFrom: userName,
      };

      if (taskToAdd.recipe) {
        taskToAdd.name = taskToAdd.recipe.name;
        taskToAdd.description = taskToAdd.recipe.description;
        taskToAdd.instruction = taskToAdd.recipe.instruction;
        taskToAdd.productTypes = taskToAdd.recipe.productTypes;
        taskToAdd.examples = taskToAdd.recipe.examples;
      }

      if (currentRoutine) {
        taskToAdd.routineId = new ObjectId(currentRoutine._id);
      }

      let draftTasks: TaskType[] = [];

      /* get the updated start and expiry dates */
      const distanceInDays = Math.round(Math.max(7 / total, 1));

      for (let j = 0; j < Math.min(total, 7); j++) {
        const starts = daysFrom({
          date: setToMidnight({
            date: new Date(startDate),
            timeZone,
          }),
          days: distanceInDays * j,
        });

        const expires = daysFrom({
          date: new Date(starts),
          days: 1,
        });

        draftTasks.push({
          ...(taskToAdd as TaskType),
          _id: new ObjectId(),
          startsAt: starts,
          expiresAt: expires,
          completedAt: null,
        });
      }

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

      /* update allTasks */
      const uniqueKeys = [...new Set(draftTasks.map((dt) => dt.key))];

      const newAllTasks = uniqueKeys.map((key) => {
        const relevantTaskInfo = draftTasks.find((t) => t.key === key);

        const ids = draftTasks
          .filter((t) => t.key === key)
          .map((t) => ({
            _id: t._id,
            startsAt: t.startsAt,
            status: TaskStatusEnum.ACTIVE,
          }));

        const { name, icon, color, concern, description, instruction } =
          relevantTaskInfo || {};

        return {
          ids,
          name,
          key,
          icon,
          color,
          concern,
          description,
          instruction,
          total,
        };
      });

      allTasks.push(...newAllTasks);

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
            part: taskToAdd.part,
            concerns: [taskToAdd.concern],
            status: RoutineStatusEnum.ACTIVE,
            startsAt: new Date(minDate),
            lastDate: new Date(maxDate),
            createdAt: new Date(),
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
        keyOne: "tasksStolen",
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
