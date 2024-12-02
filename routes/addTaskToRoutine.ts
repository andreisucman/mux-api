import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { nanoid } from "nanoid";
import { Router, Response } from "express";
import doWithRetries from "../helpers/doWithRetries.js";
import setUtcMidnight from "helpers/setUtcMidnight.js";
import { daysFrom } from "helpers/utils.js";
import sortTasksInScheduleByDate from "helpers/sortTasksInScheduleByDate.js";
import {
  CustomRequest,
  RequiredSubmissionType,
  TaskType,
  UserConcernType,
} from "types.js";
import addErrorLog from "functions/addErrorLog.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { taskKey, routineId, total, trackedUserId, type } = req.body;

  if (!taskKey || !routineId || !total || !trackedUserId || !type) return;

  try {
    const userInfo = await doWithRetries({
      functionName: "addTaskToRoutine - get user info",
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

    let taskToAdd = await doWithRetries({
      functionName: "addTaskToRoutine - find task to add",
      functionToExecute: async () =>
        db
          .collection("Task")
          .find({ routineId: new ObjectId(routineId), key: taskKey })
          .sort({ expiresAt: -1 })
          .next(),
    });

    if (!taskToAdd)
      throw new Error(
        `No task to add from user ${trackedUserId} to user ${req.userId} found.`
      );

    /* get the user's current routine */
    const currentRoutine = await doWithRetries({
      functionName: "addTaskToRoutine - get current routine",
      functionToExecute: async () =>
        db
          .collection("Routine")
          .find({ userId: new ObjectId(req.userId), type, status: "active" })
          .next(),
    });

    /* reset personalized fields */
    taskToAdd = {
      ...taskToAdd,
      _id: new ObjectId(),
      routineId: new ObjectId(currentRoutine._id),
      suggestions: taskToAdd.defaultSuggestions,
      proofEnabled: true,
      productsPersonalized: false,
      requiredSubmissions: taskToAdd.requiredSubmissions.map(
        (submission: RequiredSubmissionType) => ({
          _id: nanoid(),
          proofId: "",
          ...submission,
          isSubmitted: false,
        })
      ),
    } as unknown as TaskType;

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
      });
    }

    let { finalSchedule, concerns, allTasks } = currentRoutine;

    /* update final schedule */
    for (let i = 0; i < draftTasks.length; i++) {
      const task = draftTasks[i];
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
    const newConcerns = draftTasks
      .filter((obj: TaskType) => !currentConcerns.includes(obj.concern))
      .map((t) => ({
        type,
        name: t.concern,
        isDisabled: false,
        imported: true,
      }));

    if (newConcerns.length > 0) {
      concerns.push(...newConcerns);
    }

    /* update allTasks */
    const newAllTasks = draftTasks.map((t) => {
      const { name, key, icon, color, description, instruction, concern } = t;

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

    allTasks.push(...newAllTasks);

    const dates = Object.keys(finalSchedule);
    const lastRoutineDate = dates[dates.length - 1];

    await doWithRetries({
      functionName: "addTaskToRoutine route - update routine",
      functionToExecute: async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(currentRoutine._id) },
          {
            $set: {
              finalSchedule,
              allTasks,
              concerns,
              lastDate: new Date(lastRoutineDate),
            },
          }
        ),
    });

    await doWithRetries({
      functionName: "addTaskToRoutine - insert tasks",
      functionToExecute: async () =>
        db.collection("Task").insertMany(draftTasks),
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
  } catch (error) {
    addErrorLog({
      functionName: "addTaskToRoutine",
      message: error.message,
    });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
