import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CustomRequest,
  RequiredSubmissionType,
  TaskType,
  UserConcernType,
} from "types.js";
import sortTasksInScheduleByDate from "helpers/sortTasksInScheduleByDate.js";
import getLatestRoutinesAndTasks from "functions/getLatestRoutineAndTasks.js";
import setUtcMidnight from "helpers/setUtcMidnight.js";
import addErrorLog from "functions/addErrorLog.js";
import { daysFrom } from "helpers/utils.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { routineId, type } = req.body;

  if (!routineId || !type) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await doWithRetries({
      functionName: "replaceRoutine - get user info",
      functionToExecute: async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
          },
          { projection: { timeZone: 1 } }
        ),
    });

    if (!userInfo) throw new Error(`User ${req.userId} not found`);

    const { timeZone } = userInfo;

    const replacementRoutine = await doWithRetries({
      functionName: "replaceRoutine - get routine to replace",
      functionToExecute: async () =>
        db
          .collection("Routine")
          .findOne(
            { _id: new ObjectId(routineId) },
            { projection: { _id: 0 } }
          ),
    });

    /* get the user's current routine */
    const currentRoutine = await doWithRetries({
      functionName: "replaceRoutine - get current routine",
      functionToExecute: async () =>
        db
          .collection("Routine")
          .find(
            { userId: new ObjectId(req.userId), type, status: "active" },
            { projection: { _id: 1 } }
          )
          .next(),
    });

    let replacementTasks = await doWithRetries({
      functionName: "replaceRoutine - get replacement tasks",
      functionToExecute: async () =>
        db
          .collection("Task")
          .find({ routineId: new ObjectId(routineId) })
          .sort({ expiresAt: -1 })
          .toArray(),
    });

    if (replacementTasks.length === 0) throw new Error(`No tasks to add`);

    const newRoutineId = new ObjectId();

    /* reset personalized fields */
    replacementTasks = replacementTasks.map((task) => ({
      ...task,
      userId: new ObjectId(req.userId),
      routineId: newRoutineId,
      suggestions: task.defaultSuggestions,
      proofEnabled: true,
      productsPersonalized: false,
      status: "active",
      requiredSubmissions: task.requiredSubmissions.map(
        (submission: RequiredSubmissionType) => ({
          ...submission,
          proofId: "",
          isSubmitted: false,
        })
      ),
    }));

    /* get the frequencies for each task */
    const taskFrequencyMap = replacementTasks.reduce(
      (a: { [key: string]: any }, c: TaskType) => {
        if (a[c.key]) {
          a[c.key] += c.requiredSubmissions.length;
        } else {
          a[c.key] = c.requiredSubmissions.length;
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
          _id: new ObjectId(),
          startsAt: starts,
          expiresAt: expires,
        } as unknown as TaskType);
      }
    }

    let { concerns, allTasks } = replacementRoutine;

    let finalSchedule = {} as {
      [key: string]: { key: string; concern: string }[];
    };

    /* update final schedule */
    for (let i = 0; i < replacementTaskWithDates.length; i++) {
      const task = replacementTaskWithDates[i];
      const dateString = new Date(task.startsAt).toDateString();

      const simpleTaskContent = {
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
    allTasks = taskKeys.map((taskKey: string) => {
      const relevantInfoTask = replacementTaskWithDates.find(
        (task) => task.key === taskKey
      );
      const { name, key, icon, color, concern, description, instruction } =
        relevantInfoTask;

      const total = taskFrequencyMap[key];

      return {
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

    await doWithRetries({
      functionName: "replaceRoutine - deactivate current routine",
      functionToExecute: async () =>
        db
          .collection("Routine")
          .updateOne(
            { _id: new ObjectId(currentRoutine._id) },
            { $set: { status: "replaced" } }
          ),
    });

    const newRoutine = {
      ...replacementRoutine,
      _id: newRoutineId,
      userId: new ObjectId(req.userId),
      createdAt: new Date(),
      finalSchedule,
      allTasks,
      concerns,
      lastDate: new Date(lastRoutineDate),
      status: "active",
    };

    await doWithRetries({
      functionName: "saveTaskFromDescription route - update routine",
      functionToExecute: async () =>
        db.collection("Routine").insertOne(newRoutine),
    });

    await doWithRetries({
      functionName: "replaceRoutine - delete current tasks",
      functionToExecute: async () =>
        db
          .collection("Task")
          .updateMany(
            { routineId: new ObjectId(currentRoutine._id) },
            { $set: { status: "canceled" } }
          ),
    });

    await doWithRetries({
      functionName: "replaceRoutine - insert new tasks",
      functionToExecute: async () =>
        db.collection("Task").insertMany(replacementTaskWithDates),
    });

    const { routines, tasks } = await getLatestRoutinesAndTasks({
      userId: req.userId,
    });

    res.status(200).json({ message: { routines, tasks } });
  } catch (error) {
    addErrorLog({
      functionName: "replaceRoutine",
      message: error.message,
    });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
