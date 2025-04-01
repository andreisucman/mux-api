import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ObjectId } from "mongodb";
import { db } from "@/init.js";

type Props = {
  routineId: string;
};

export default async function deleteRoutine({ routineId }: Props) {
  try {
    const now = new Date();

    await doWithRetries(async () =>
      db.collection("Routine").updateOne(
        { _id: new ObjectId(routineId) },
        {
          $set: {
            "allTasks.$[task].ids.$[id].deletedOn": now,
            deletedOn: now,
          },
        },
        {
          arrayFilters: [
            { "task.name": { $exists: true } },
            { "id.status": { $exists: true } },
          ],
        }
      )
    );

    await doWithRetries(async () =>
      db.collection("Task").updateMany(
        {
          routineId: new ObjectId(routineId),
        },
        {
          $set: {
            deletedOn: now,
          },
        }
      )
    );
  } catch (error) {
    throw httpError(error);
  }
}
