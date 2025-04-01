import doWithRetries from "@/helpers/doWithRetries.js";
import getMinAndMaxRoutineDates from "@/helpers/getMinAndMaxRoutineDates.js";
import httpError from "@/helpers/httpError.js";
import sortTasksInScheduleByDate from "@/helpers/sortTasksInScheduleByDate.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import { daysFrom } from "@/helpers/utils.js";
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
  daysDifference: number;
  hostRoutine: RoutineType;
};

export default async function cloneSingleRoutine({
  userId,
  userName,
  daysDifference,
  hostRoutine,
}: Props) {
  try {
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
    replacementTasks = replacementTasks.map((task) => {
      const newTask: TaskType = {
        ...task,
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        routineId: newRoutineId,
        proofEnabled: true,
        status: TaskStatusEnum.ACTIVE,
        startsAt: daysFrom({ date: task.startsAt, days: daysDifference }),
        expiresAt: daysFrom({ date: task.expiresAt, days: daysDifference }),
        completedAt: null,
        userName,
      };
      if (newTask.recipe) {
        newTask.name = newTask.recipe.name;
        newTask.description = newTask.recipe.description;
        newTask.instruction = newTask.recipe.instruction;
        newTask.productTypes = newTask.recipe.productTypes;
        newTask.examples = newTask.recipe.examples;
      }
      if (userName) newTask.stolenFrom = userName;
      return newTask;
    });

    let finalSchedule: {
      [key: string]: ScheduleTaskType[];
    } = {};

    /* update final schedule */
    for (let i = 0; i < replacementTasks.length; i++) {
      const task = replacementTasks[i];
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
    const uniqueTaskKeys = [...new Set(replacementTasks.map((t) => t.key))];

    const updatedAllTasks = uniqueTaskKeys.map((taskKey: string) => {
      const ids = replacementTasks
        .filter((t) => t.key === taskKey)
        .map((t) => ({
          _id: t._id,
          startsAt: t.startsAt,
          status: TaskStatusEnum.ACTIVE,
        }));

      const relevantInfoTask = replacementTasks.find(
        (task) => task.key === taskKey
      );
      const { name, key, icon, color, concern, description, instruction } =
        relevantInfoTask;

      const total = replacementTasks.filter((t) => t.key === key).length;

      return {
        ids,
        name,
        key,
        icon,
        color,
        concern,
        total,
        completed: 0,
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
      isPublic: false,
      allTasks: updatedAllTasks,
      startsAt: new Date(minDate),
      lastDate: new Date(maxDate),
      status: RoutineStatusEnum.ACTIVE,
    };

    delete newRoutine.deletedOn;

    if (userName) newRoutine.stolenFrom = hostRoutine.userName;

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

    return newRoutine;
  } catch (error) {
    throw httpError(error);
  }
}
