import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { daysFrom } from "@/helpers/utils.js";
import { RoutineStatusEnum } from "@/types.js";
import setToMidnight from "@/helpers/setToMidnight.js";

type Props = {
  userId: string;
  timeZone: string;
  filter?: { [key: string]: any };
  returnOnlyRoutines?: boolean;
};

export default async function getLatestRoutinesAndTasks({
  userId,
  timeZone,
  filter = {},
  returnOnlyRoutines,
}: Props) {
  try {
    const match = {
      userId: new ObjectId(userId),
      status: RoutineStatusEnum.ACTIVE,
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

    const todayMidnight = setToMidnight({
      date: new Date(),
      timeZone,
    });
    const tomorrowMidnight = setToMidnight({
      date: daysFrom({ days: 1 }),
      timeZone,
    });
    const startsAtFrom = setToMidnight({
      date: theEarliestRoutine.startsAt,
      timeZone,
    });
    const startsAtTo = setToMidnight({
      date: daysFrom({ date: startsAtFrom, days: 1 }),
      timeZone,
    });

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
      isFood: 1,
      description: 1,
      startsAt: 1,
      completedAt: 1,
      expiresAt: 1,
    };

    const tasks = await doWithRetries(async () => {
      const sort = { startsAt: 1, status: 1, part: -1, name: 1 };

      const primaryResult = await db
        .collection("Task")
        .aggregate([
          {
            $match: {
              userId: new ObjectId(userId),
              startsAt: { $gte: todayMidnight, $lt: tomorrowMidnight },
              status: { $in: ["active", "completed"] },
            },
          },
          { $sort: sort },
          { $project: project },
        ])
        .toArray();

      if (primaryResult.length > 0) {
        return primaryResult;
      }

      return db
        .collection("Task")
        .aggregate([
          {
            $match: {
              userId: new ObjectId(userId),
              $and: [
                { startsAt: { $gte: startsAtFrom, $lt: startsAtTo } },
                { startsAt: { $gte: todayMidnight } },
              ],
              status: { $in: ["active", "completed"] },
            },
          },
          { $sort: sort },
          { $project: project },
        ])
        .toArray();
    });

    return { routines, tasks };
  } catch (err) {
    throw httpError(err);
  }
}
