import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import { daysFrom } from "@/helpers/utils.js";

type Props = {
  routineIds: ObjectId[];
};

export default async function getClosestTaskDates({ routineIds }: Props) {
  try {
    const expiresAtFrom = setUtcMidnight({ date: new Date() });
    const expiresAtTo = setUtcMidnight({ date: daysFrom({ days: 2 }) });

    const closestTasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .aggregate([
          {
            $match: {
              routineId: { $in: routineIds },
              // expiresAt: { $gte: new Date() },
              expiresAt: { $gte: expiresAtFrom, $lte: expiresAtTo },
            },
          },
          { $sort: { startsAt: 1 } },
          // {
          //   $group: {
          //     _id: "$part",
          //     routineId: { $first: "$routineId" },
          //     startsAt: { $first: "$startsAt" },
          //   },
          // },
          {
            $project: {
              _id: 0,
              routineId: 1,
              startsAt: 1,
              // part: "$_id",
              part: 1,
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
