import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";
import { RoutineStatusEnum } from "@/types.js";
import { ObjectId } from "mongodb";

type Props = {
  routineIds: string[];
  userId: string;
};

export default async function deactivateHangingBaAndRoutineData({
  routineIds,
  userId,
}: Props) {
  try {
    const partsDeletedObjects = await doWithRetries(() =>
      db
        .collection("Routine")
        .aggregate([
          {
            $match: {
              _id: { $in: routineIds.map((id) => new ObjectId(id)) },
              userId: new ObjectId(userId),
            },
          },
          {
            $group: {
              _id: "$part",
            },
          },
          {
            $project: {
              _id: 1,
            },
          },
        ])
        .toArray()
    );

    const partsDeleted = partsDeletedObjects.map((obj) => obj._id);

    const remainingPartRoutines = await doWithRetries(() =>
      db
        .collection("Routine")
        .aggregate([
          {
            $match: {
              userId: new ObjectId(userId),
              part: { $in: partsDeleted },
              status: { $ne: RoutineStatusEnum.CANCELED },
              deletedOn: { $exists: false },
            },
          },
          {
            $group: {
              _id: "$part",
            },
          },
        ])
        .toArray()
    );

    const partsRemaining = remainingPartRoutines.map((obj) => obj._id);

    const noRoutineParts = partsDeleted.filter(
      (part) => !partsRemaining.includes(part)
    );

    const routineDataUpdateOps = noRoutineParts.map((part) => ({
      updateOne: {
        filter: { part, userId: new ObjectId(userId) },
        update: { $set: { status: "hidden" } },
      },
    }));

    const baUpdateOps = noRoutineParts.map((part) => ({
      updateOne: {
        filter: { part, userId: new ObjectId(userId) },
        update: { $set: { isPublic: false } },
      },
    }));

    if (routineDataUpdateOps.length)
      await doWithRetries(() =>
        db.collection("RoutineData").bulkWrite(routineDataUpdateOps)
      );

    if (baUpdateOps.length)
      await doWithRetries(() =>
        db.collection("BeforeAfter").bulkWrite(baUpdateOps)
      );
  } catch (err) {
    throw httpError(err);
  }
}
