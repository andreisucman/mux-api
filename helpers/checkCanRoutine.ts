import { NextActionType } from "types.js";
import doWithRetries from "./doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  nextRoutine: NextActionType[];
  userId: string;
};

export default async function checkCanRoutine({ nextRoutine, userId }: Props) {
  const scannedPartsDocs = await doWithRetries(() =>
    db
      .collection("Progress")
      .aggregate([
        { $match: { userId: new ObjectId(userId) } },
        { $group: { _id: "$part" } },
        { $project: { _id: 1 } },
      ])
      .toArray()
  );

  const scannedParts = scannedPartsDocs.map((doc) => doc._id);

  const availableRoutines = nextRoutine.filter(
    (routine) =>
      (!routine.date || new Date(routine.date) < new Date()) &&
      scannedParts.includes(routine.part)
  );

  const unavailableRoutines = nextRoutine.filter(
    (routine) => routine.date || new Date(routine.date) > new Date()
  );

  const canRoutineDate = Math.min(
    ...unavailableRoutines.map((r) =>
      r.date ? new Date(r.date).getTime() : Infinity
    )
  );

  return {
    canRoutineDate,
    availableRoutines,
    unavailableRoutines,
  };
}
