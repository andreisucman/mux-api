import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  routineIds: ObjectId[];
};

export default async function getClosestTaskDates({ routineIds }: Props) {
  try {
    const closestTasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .aggregate([
          {
            $match: {
              routineId: { $in: routineIds },
              expiresAt: { $gte: new Date() },
            },
          },
          { $sort: { startsAt: 1 } },
          {
            $group: {
              _id: "$part",
              routineId: { $first: "$routineId" },
              startsAt: { $first: "$startsAt" },
            },
          },
          {
            $project: {
              _id: 0,
              routineId: 1,
              startsAt: 1,
              part: "$_id",
            },
          },
        ])
        .toArray()
    );

    return closestTasks;
  } catch (err) {
    throw httpError(err);
  }
}
