import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import setUtcMidnight from "helpers/setUtcMidnight.js";
import { daysFrom } from "helpers/utils.js";
import sortTasksInScheduleByDate from "helpers/sortTasksInScheduleByDate.js";
import {
  AllTaskType,
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

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskKey, routineId, total, followingUserName, type } = req.body;

    try {
      if (!taskKey || !routineId || !total || !followingUserName || !type) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { timeZone: 1, name:1 },
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
          `No task to add from user ${followingUserName} to user ${req.userId} found.`
        );

      /* get the user's current routine */
      const currentRoutine = (await doWithRetries(async () =>
        db
          .collection("Routine")
          .find({
            userId: new ObjectId(req.userId),
            type,
            status: RoutineStatusEnum.ACTIVE,
          })
          .next()
      )) as unknown as RoutineType;

      /* reset personalized fields */
      taskToAdd = {
        ...taskToAdd,
        _id: new ObjectId(),
        proofEnabled: true,
        isSubmitted: false,
        stolenFrom: followingUserName,
      };

      if (currentRoutine) {
        taskToAdd.routineId = new ObjectId(currentRoutine._id);
      }

      const draftTasks: TaskType[] = [];

      /* get the updated start and expiry dates */
      const distanceInDays = Math.round(Math.max(7 / total, 1));

      for (let j = 0; j < Math.min(total, 7); j++) {
        const starts = daysFrom({
          date: setUtcMidnight({
            date: new Date(),
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
      let allTasks: AllTaskType[] = currentAllTasks || [];

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
          completed: 0,
          unknown: 0,
        };
      });

      allTasks.push(...newAllTasks);

      const dates = Object.keys(finalSchedule);
      const lastRoutineDate = dates[dates.length - 1];

      if (currentRoutine) {
        await doWithRetries(async () =>
          db.collection("Routine").updateOne(
            { _id: new ObjectId(currentRoutine?._id) },
            {
              $set: {
                finalSchedule,
                allTasks,
                concerns,
                lastDate: new Date(lastRoutineDate),
              },
            }
          )
        );
      } else {
        await doWithRetries(async () =>
          db.collection("Routine").insertOne({
            userId: new ObjectId(req.userId),
            allTasks,
            finalSchedule,
            type: taskToAdd.type,
            part: taskToAdd.part,
            concerns: [taskToAdd.concern],
            status: RoutineStatusEnum.ACTIVE,
            lastDate: new Date(lastRoutineDate),
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
        message: {
          routine: {
            ...currentRoutine,
            finalSchedule,
            allTasks,
            concerns,
            lastDate: new Date(lastRoutineDate),
          },
          tasks: draftTasks,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
