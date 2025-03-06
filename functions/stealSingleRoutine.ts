import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";
import { RoutineStatusEnum, RoutineType, TaskStatusEnum } from "@/types.js";
import createRoutineReplacementData from "./createRoutineReplacementData.js";
import updateTasksAnalytics from "./updateTasksAnalytics.js";
import updateAnalytics from "./updateAnalytics.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  part: string;
  userName: string;
  startDate: string;
  timeZone: string;
  hostRoutine: RoutineType;
};

export default async function stealSingleRoutine({
  userId,
  part,
  userName,
  startDate,
  timeZone,
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
            part,
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

    const { _id: hostRoutineId, allTasks: hostAllTasks } = hostRoutine;

    const {
      newRoutineId,
      minDate,
      maxDate,
      finalSchedule,
      allTasks,
      replacementTasks,
    } = await createRoutineReplacementData({
      startDate,
      timeZone,
      userId,
      userName,
      hostRoutineId: hostRoutineId,
      hostRoutineAllTasks: hostAllTasks,
    });

    const newRoutine = {
      ...hostRoutine,
      _id: newRoutineId,
      userId: new ObjectId(userId),
      createdAt: new Date(),
      startsAt: new Date(minDate),
      lastDate: new Date(maxDate),
      status: RoutineStatusEnum.ACTIVE,
      allTasks,
      userName,
      finalSchedule,
      stolenFrom: userName,
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
  } catch (err) {
    throw httpError(err);
  }
}
