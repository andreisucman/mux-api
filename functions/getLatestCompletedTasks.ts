import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { TaskStatusEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

type Props = {
  userId: string;
  from: Date;
};

export default async function getLatestCompletedTasks({ userId, from }: Props) {
  try {
    const tasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .find(
          {
            userId: new ObjectId(userId),
            startsAt: { $gt: new Date(from) },
            status: TaskStatusEnum.COMPLETED,
          },
          { projection: { key: 1, completedAt: 1 } }
        )
        .sort({ completedAt: 1 })
        .toArray()
    );

    const map = tasks.reduce((a, c) => {
      const dateKey = new Date(c.completedAt).toDateString();
      a[c.key] = dateKey;
      return a;
    }, {});

    return map;
  } catch (err) {
    throw httpError(err);
  }
}
