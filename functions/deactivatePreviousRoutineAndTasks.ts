import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";
import { RoutineStatusEnum, TaskStatusEnum } from "@/types.js";

export default async function deactivatePreviousRoutineAndTasks(
  routineId: string
) {
  try {
    await doWithRetries(async () =>
      db.collection("Routine").updateOne(
        {
          _id: new ObjectId(routineId),
          status: RoutineStatusEnum.ACTIVE,
        },
        { $set: { status: RoutineStatusEnum.INACTIVE } }
      )
    );

    await doWithRetries(async () =>
      db.collection("Task").updateMany(
        {
          routineId: new ObjectId(routineId),
          status: TaskStatusEnum.ACTIVE,
        },
        { $set: { status: TaskStatusEnum.INACTIVE } }
      )
    );
  } catch (err) {
    throw httpError(err);
  }
}
