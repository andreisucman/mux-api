import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { TaskStatusEnum } from "@/types.js";
import { daysFrom } from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

type Props = {
  userId: string;
  days: number;
  statuses: TaskStatusEnum[];
};

export default async function getLatestTaskStatus({
  days,
  statuses,
  userId,
}: Props) {
  try {
    const oneMonthAgo = daysFrom({ days: days * -1 });

    const tasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .find(
          {
            userId: new ObjectId(userId),
            startsAt: { $gt: new Date(oneMonthAgo) },
            status: { $in: statuses },
          },
          { projection: { key: 1 } }
        )
        .toArray()
    );

    return [...new Set(tasks.map((obj) => obj.key))];
  } catch (err) {
    throw httpError(err);
  }
}
