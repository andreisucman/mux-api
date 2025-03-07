import doWithRetries from "@/helpers/doWithRetries.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import httpError from "@/helpers/httpError.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import { calculateDaysDifference, daysFrom } from "@/helpers/utils.js";
import {
  RoutineStatusEnum,
  RoutineType,
  TaskStatusEnum,
  TaskType,
} from "@/types.js";
import { ObjectId } from "mongodb";
import { db } from "@/init.js";
import updateAnalytics from "./updateAnalytics.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";

type Props = {
  userId: string;
  userName: string;
  timeZone: string;
  startDate: string;
  hostRoutine: RoutineType;
};

export default async function stealSingleRoutine({
  userId,
  userName,
  timeZone,
  startDate,
  hostRoutine,
}: Props) {
  try {
    const currentRoutine = await doWithRetries(async () =>
      db
        .collection("Routine")
        .find(
          {
            userId: new ObjectId(userId),
            status: RoutineStatusEnum.ACTIVE,
            part: hostRoutine.part,
          },
          { projection: { _id: 1 } }
        )
        .sort({ _id: -1 })
        .next()
    );

    if (currentRoutine) {
      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(currentRoutine._id) },
          {
            $set: {
              status: RoutineStatusEnum.INACTIVE,
            },
          }
        )
      );

      await doWithRetries(async () =>
        db
          .collection("Task")
          .updateMany(
            { routineId: new ObjectId(currentRoutine._id) },
            { $set: { status: TaskStatusEnum.INACTIVE } }
          )
      );
    }

    let replacementTasks = (await doWithRetries(async () =>
      db
        .collection("Task")
        .find({ routineId: new ObjectId(hostRoutine._id) })
        .sort({ _id: 1 })
        .toArray()
    )) as unknown as TaskType[];

    if (replacementTasks.length === 0) throw httpError(`No tasks to add`);

    const newRoutineId = new ObjectId();

    /* reset personalized fields */
    replacementTasks = replacementTasks.map((task) => ({
      ...task,
      userId: new ObjectId(userId),
      routineId: newRoutineId,
      proofEnabled: true,
      status: TaskStatusEnum.ACTIVE,
      completedAt: null,
      userName,
      stolenFrom: userName,
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

      const relevantTasks = replacementTasks.filter(
        (t) => t.key === taskKeys[i]
      );

      for (let j = 0; j < frequency; j++) {
        const initialDate = relevantTasks[0].startsAt;
        const currentDate = relevantTasks[j].startsAt;
        const daysDifference = calculateDaysDifference(
          initialDate,
          currentDate
        );

        const starts = daysFrom({
          date: setToMidnight({
            date: new Date(startDate),
            timeZone,
          }),
          days: daysDifference,
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
          completedAt: null,
        } as unknown as TaskType);
      }
    }

    let finalSchedule: {
      [key: string]: ScheduleTaskType[];
    } = {};

    /* update final schedule */
    for (let i = 0; i < replacementTaskWithDates.length; i++) {
      const task = replacementTaskWithDates[i];
      const dateString = new Date(task.startsAt).toDateString();

      const simpleTaskContent: ScheduleTaskType = {
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

    /* update allTasks */
    const uniqueTaskKeys = [...new Set(taskKeys)];

    const updatedAllTasks = uniqueTaskKeys.map((taskKey: string) => {
      const ids = replacementTaskWithDates
        .filter((t) => t.key === taskKey)
        .map((t) => ({
          _id: t._id,
          startsAt: t.startsAt,
          status: TaskStatusEnum.ACTIVE,
        }));

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

    const { minDate, maxDate } = getMinAndMaxRoutineDates(updatedAllTasks);

    const newRoutine = {
      ...hostRoutine,
      _id: newRoutineId,
      userId: new ObjectId(userId),
      createdAt: new Date(),
      finalSchedule,
      userName,
      allTasks: updatedAllTasks,
      startsAt: new Date(minDate),
      lastDate: new Date(maxDate),
      status: RoutineStatusEnum.ACTIVE,
      stolenFrom: hostRoutine.userName,
    };

    await doWithRetries(async () =>
      db.collection("Routine").insertOne(newRoutine)
    );

    await doWithRetries(async () =>
      db.collection("Task").insertMany(replacementTasks)
    );

    updateTasksAnalytics({
      userId,
      tasksToInsert: replacementTasks,
      keyOne: "tasksCreated",
    });

    updateTasksAnalytics({
      userId,
      tasksToInsert: replacementTasks,
      keyOne: "tasksStolen",
      keyTwo: "manualTasksStolen",
    });

    updateAnalytics({
      userId,
      incrementPayload: {
        "overview.usage.routinesStolen": 1,
        [`overview.tasks.part.routinesStolen.${hostRoutine.part}`]: 1,
      },
    });
  } catch (error) {
    throw httpError(error);
  }
}
