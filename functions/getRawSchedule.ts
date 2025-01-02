import * as dotenv from "dotenv";
dotenv.config();

import { daysFrom } from "helpers/utils.js";
import turnTasksIntoSchedule from "helpers/turnTasksIntoSchedule.js";
import trimSchedule from "helpers/trimSchedule.js";
import doWithRetries from "helpers/doWithRetries.js";
import { AllTaskType, UserConcernType } from "types.js";
import httpError from "helpers/httpError.js";
import { db } from "init.js";

type Props = {
  solutionsAndFrequencies: AllTaskType[];
  concerns: UserConcernType[];
  days: number;
};

export default async function getRawSchedule({
  solutionsAndFrequencies,
  concerns,
  days,
}: Props) {
  try {
    const dateOne = new Date();
    const dateTwo = daysFrom({ days: days ? days : 6 });
    const lastMonth = daysFrom({ days: -30 });

    const pastTasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .find(
          { createdAt: { $gt: lastMonth } },
          { projection: { key: 1, earliestNextStartDate: 1 } }
        )
        .toArray()
    );

    const earliestStartMap = pastTasks.reduce(
      (acc: { [key: string]: Date }, current) => {
        if (acc[current.key]) {
          const greater =
            new Date(current.earliestNextStartDate) >
            new Date(acc[current.key]);
          if (greater) {
            acc[current.key] = new Date(current.earliestNextStartDate); // to take the farthest next date among the same tasks
          }
        } else {
          acc[current.key] = new Date(current.earliestNextStartDate);
        }
        return acc;
      },
      {}
    );

    let sortedSchedule = turnTasksIntoSchedule({
      dateOne,
      dateTwo,
      earliestStartMap,
      solutionsAndFrequencies,
    });

    const tasksList = Object.values(sortedSchedule).flat().filter(Boolean);

    let toDeleteCount =
      tasksList.length - Number(process.env.MAX_TASKS_PER_SCHEDULE);
    toDeleteCount = toDeleteCount > 0 ? toDeleteCount : 0;

    if (toDeleteCount > 0) {
      concerns.sort((a, b) => a.importance - b.importance);

      sortedSchedule = trimSchedule({
        days,
        toDeleteCount,
        schedule: sortedSchedule,
        concernsNamesDescending: concerns.map((c) => c.name),
      });
    }

    return { rawSchedule: sortedSchedule };
  } catch (error) {
    throw httpError(error);
  }
}
