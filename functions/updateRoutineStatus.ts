import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { RoutineStatusEnum, TaskStatusEnum } from "@/types.js";
import { ObjectId } from "mongodb";
import { db } from "@/init.js";

type Props = {
  newStatus: RoutineStatusEnum;
  routineId: string;
};

export default async function updateRoutineStatus({
  newStatus,
  routineId,
}: Props) {
  const taskFilterStatus =
    newStatus === "active"
      ? TaskStatusEnum.CANCELED
      : newStatus === "deleted"
      ? TaskStatusEnum.CANCELED
      : TaskStatusEnum.ACTIVE;

  const deletedOn = newStatus === "deleted" ? new Date() : undefined;

  try {
    await doWithRetries(async () =>
      db.collection("Routine").updateOne(
        { _id: new ObjectId(routineId) },
        {
          $set: {
            status: newStatus,
            "allTasks.$[task].ids.$[id].status": newStatus,
            deletedOn,
          },
        },
        {
          arrayFilters: [
            { "task.name": { $exists: true } },
            { "id.status": taskFilterStatus },
          ],
        }
      )
    );

    await doWithRetries(async () =>
      db.collection("Task").updateMany(
        {
          routineId: new ObjectId(routineId),
          status: taskFilterStatus,
        },
        {
          $set: {
            status: newStatus,
          },
        }
      )
    );
  } catch (error) {
    throw httpError(error);
  }
}
