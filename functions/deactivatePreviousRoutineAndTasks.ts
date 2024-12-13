import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

export default async function deactivatePreviousRoutineAndTasks(
  routineId: string
) {
  try {
    await doWithRetries(async () =>
      db.collection("Routine").updateOne(
        {
          _id: new ObjectId(routineId),
        },
        { $set: { status: "inactive" } }
      )
    );

    await doWithRetries(async () =>
      db.collection("Task").updateMany(
        {
          routineId: new ObjectId(routineId),
        },
        { $set: { status: "inactive" } }
      )
    );
  } catch (err) {
    throw httpError(err);
  }
}
