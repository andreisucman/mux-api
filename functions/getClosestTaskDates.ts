import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
};

export default async function getClosestTaskDates({ userId }: Props) {
  try {
    const closestTasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .aggregate([
          {
            $match: {
              userId: new ObjectId(userId),
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
          { $limit: 1 },
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
    throw httpError(err.message, err.status);
  }
}
