import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { daysFrom, setToUtcMidnight } from "@/helpers/utils.js";

type Props = {
  userId: string;
  filter?: { [key: string]: any };
  returnOnlyRoutines?: boolean;
};

export default async function getLatestRoutinesAndTasks({
  userId,
  filter = {},
  returnOnlyRoutines,
}: Props) {
  try {
    const match = {
      userId: new ObjectId(userId),
      ...filter,
    };

    const routines = await doWithRetries(
      async () =>
        await db
          .collection("Routine")
          .aggregate([
            { $match: match },
            { $sort: { _id: -1 } },
            {
              $group: {
                _id: "$part",
                doc: { $first: "$$ROOT" },
              },
            },
            { $replaceRoot: { newRoot: "$doc" } },
          ])
          .toArray()
    );

    if (routines.length === 0) {
      return { routines: [], tasks: [] };
    }

    if (returnOnlyRoutines) {
      return { routines, tasks: [] };
    }

    const theEarliestRoutine = routines[0];

    const startsAtFrom = setToUtcMidnight(theEarliestRoutine.startsAt);
    const startsAtTo = setToUtcMidnight(
      daysFrom({ date: startsAtFrom, days: 1 })
    );

    const project = {
      _id: 1,
      name: 1,
      key: 1,
      icon: 1,
      color: 1,
      type: 1,
      status: 1,
      part: 1,
      routineId: 1,
      isRecipe: 1,
      description: 1,
      startsAt: 1,
      completedAt: 1,
      expiresAt: 1,
    };

    const tasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .aggregate([
          {
            $match: {
              routineId: { $in: routines.map((r) => r._id) },
              startsAt: { $gte: startsAtFrom, $lt: startsAtTo },
              status: { $in: ["active", "completed"] },
            },
          },
          { $sort: { startsAt: 1, part: -1 } },
          {
            $project: project,
          },
        ])
        .toArray()
    );

    return { routines, tasks };
  } catch (err) {
    throw httpError(err);
  }
}
