import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CustomRequest,
  RoutineStatusEnum,
  TaskStatusEnum,
  TaskType,
  UserConcernType,
} from "types.js";
import sortTasksInScheduleByDate from "helpers/sortTasksInScheduleByDate.js";
import getLatestRoutinesAndTasks from "functions/getLatestRoutineAndTasks.js";
import setUtcMidnight from "helpers/setUtcMidnight.js";
import { daysFrom } from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { routineId, type } = req.body;

    if (!routineId || !type) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { timeZone: 1 },
      });

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      const { timeZone } = userInfo;

      const replacementRoutine = await doWithRetries(async () =>
        db
          .collection("Routine")
          .findOne({ _id: new ObjectId(routineId) }, { projection: { _id: 0 } })
      );

      /* get the user's current routine */
      const currentRoutine = await doWithRetries(async () =>
        db
          .collection("Routine")
          .find(
            {
              userId: new ObjectId(req.userId),
              type,
              status: RoutineStatusEnum.ACTIVE,
            },
            { projection: { _id: 1 } }
          )
          .sort({ _id: -1 })
          .next()
      );

      let replacementTasks = (await doWithRetries(async () =>
        db
          .collection("Task")
          .find({ routineId: new ObjectId(routineId) })
          .sort({ expiresAt: -1 })
          .toArray()
      )) as unknown as TaskType[];

      if (replacementTasks.length === 0) throw httpError(`No tasks to add`);

      const newRoutineId = new ObjectId();

      /* reset personalized fields */
      replacementTasks = replacementTasks.map((task) => ({
        ...task,
        _id: new ObjectId(),
        userId: new ObjectId(req.userId),
        routineId: newRoutineId,
        proofEnabled: true,
        status: TaskStatusEnum.ACTIVE,
        isSubmitted: false,
      }));

      /* get the frequencies for each task */
      const taskFrequencyMap = replacementTasks.reduce(
        (a: { [key: string]: any }, c: TaskType) => {
          if (a[c.key]) {
            a[c.key] += 1;
          } else {
            a[c.key] = 1;
          }
          return a;
        },
        {}
      );

      const taskKeys = Object.keys(taskFrequencyMap);
      const replacementTaskWithDates: TaskType[] = [];

      /* get the updated start and expiry dates for each task */
      for (let i = 0; i < taskKeys.length; i++) {
        const frequency = taskFrequencyMap[taskKeys[i]];
        const relevantTaskInfo = replacementTasks.find(
          (task: TaskType) => task.key === taskKeys[i]
        );

        const distanceInDays = Math.round(Math.max(7 / frequency, 1));

        for (let j = 0; j < Math.min(frequency, 7); j++) {
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

          replacementTaskWithDates.push({
            ...relevantTaskInfo,
            startsAt: starts,
            expiresAt: expires,
            completedAt: null,
          } as unknown as TaskType);
        }
      }

      let { concerns, allTasks } = replacementRoutine;

      let finalSchedule: {
        [key: string]: ScheduleTaskType[];
      } = {};

      /* update final schedule */
      for (let i = 0; i < replacementTaskWithDates.length; i++) {
        const task = replacementTaskWithDates[i];
        const dateString = new Date(task.startsAt).toDateString();

        const simpleTaskContent: ScheduleTaskType = {
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

      /* update concerns */
      const currentConcerns = concerns.map((c: UserConcernType) => c.name);
      const newConcerns = replacementTaskWithDates
        .filter((obj: TaskType) => !currentConcerns.includes(obj.concern))
        .map((t) => ({
          name: t.concern,
          type,
          isDisabled: false,
          imported: true,
        }));

      if (newConcerns.length > 0) {
        concerns.push(...newConcerns);
      }

      /* update allTasks */
      const uniqueTaskKeys = [...new Set(taskKeys)];
      allTasks = uniqueTaskKeys.map((taskKey: string) => {
        const ids = replacementTaskWithDates
          .filter((t) => t.key === taskKey)
          .map((t) => ({ _id: t._id, status: TaskStatusEnum.ACTIVE }));

        const relevantInfoTask = replacementTaskWithDates.find(
          (task) => task.key === taskKey
        );
        const { name, key, icon, color, concern, description, instruction } =
          relevantInfoTask;

        const total = taskFrequencyMap[key];

        return {
          ids,
          name,
          key,
          icon,
          color,
          concern,
          total,
          completed: 0,
          unknown: 0,
          description,
          instruction,
        };
      });

      const dates = Object.keys(finalSchedule);
      const lastRoutineDate = dates[dates.length - 1];

      await doWithRetries(async () =>
        db
          .collection("Routine")
          .updateOne(
            { _id: new ObjectId(currentRoutine._id) },
            { $set: { status: RoutineStatusEnum.REPLACED } }
          )
      );

      const newRoutine = {
        ...replacementRoutine,
        _id: newRoutineId,
        userId: new ObjectId(req.userId),
        createdAt: new Date(),
        finalSchedule,
        allTasks,
        concerns,
        lastDate: new Date(lastRoutineDate),
        status: RoutineStatusEnum.ACTIVE,
      };

      await doWithRetries(async () =>
        db.collection("Routine").insertOne(newRoutine)
      );

      await doWithRetries(async () =>
        db
          .collection("Task")
          .updateMany(
            { routineId: new ObjectId(currentRoutine._id) },
            { $set: { status: TaskStatusEnum.CANCELED } }
          )
      );

      await doWithRetries(async () =>
        db.collection("Task").insertMany(replacementTaskWithDates)
      );

      const { routines, tasks } = await getLatestRoutinesAndTasks({
        userId: req.userId,
      });

      updateTasksAnalytics({
        userId: req.userId,
        tasksToInsert: replacementTaskWithDates,
        keyOne: "tasksCreated",
      });

      updateTasksAnalytics({
        userId: req.userId,
        tasksToInsert: replacementTaskWithDates,
        keyOne: "tasksStolen",
        keyTwo: "manualTasksStolen",
      });

      updateAnalytics({
        userId: req.userId,
        incrementPayload: {
          "overview.usage.routinesStolen": 1,
          [`overview.tasks.part.routinesStolen.${type}`]: 1,
        },
      });

      res.status(200).json({ message: { routines, tasks } });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
