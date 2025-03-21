import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { daysFrom } from "@/helpers/utils.js";
import { RoutineStatusEnum, TaskStatusEnum } from "@/types.js";
import setToMidnight from "@/helpers/setToMidnight.js";

type Props = {
  userId: string;
  timeZone: string;
  sort?: { [key: string]: any };
  filter?: { [key: string]: any };
  returnOnlyRoutines?: boolean;
};

export default async function getLatestTasks({ userId, timeZone }: Props) {
  try {
    const todayMidnight = setToMidnight({
      date: new Date(),
      timeZone,
    });
    const nextMidnight = setToMidnight({
      date: daysFrom({ days: 2 }),
      timeZone,
    });

    const closestActiveTask = await doWithRetries(() =>
      db
        .collection("Task")
        .find({
          status: { $in: [TaskStatusEnum.ACTIVE, TaskStatusEnum.COMPLETED] },
          startsAt: { $gt: todayMidnight },
        })
        .sort({ startsAt: 1 })
        .project({ startsAt: 1 })
        .next()
    );

    let startsAtFrom;
    let startsAtTo;

    if (closestActiveTask) {
      startsAtFrom = setToMidnight({
        date: closestActiveTask.startsAt || todayMidnight,
        timeZone,
      });
      startsAtTo = setToMidnight({
        date: daysFrom({ date: startsAtFrom, days: 2 }),
        timeZone,
      });
    }

    const project = {
      _id: 1,
      name: 1,
      key: 1,
      icon: 1,
      color: 1,
      type: 1,
      status: 1,
      concern: 1,
      part: 1,
      routineId: 1,
      isDish: 1,
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
              startsAt: { $gte: todayMidnight, $lt: nextMidnight },
              status: {
                $in: [TaskStatusEnum.ACTIVE, TaskStatusEnum.COMPLETED],
              },
            },
          },
          { $sort: sort },
          { $project: project },
        ])
        .toArray();

      if (primaryResult.length > 0) {
        return primaryResult;
      }

      if (!closestActiveTask) {
        return [];
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
              status: {
                $in: [TaskStatusEnum.ACTIVE, TaskStatusEnum.COMPLETED],
              },
            },
          },
          { $sort: sort },
          { $project: project },
        ])
        .toArray();
    });

    return tasks;
  } catch (err) {
    throw httpError(err);
  }
}
