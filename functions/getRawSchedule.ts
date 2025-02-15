import * as dotenv from "dotenv";
dotenv.config();

import { daysFrom } from "helpers/utils.js";
import turnTasksIntoSchedule from "helpers/turnTasksIntoSchedule.js";
import doWithRetries from "helpers/doWithRetries.js";
import { AllTaskType } from "types.js";
import httpError from "helpers/httpError.js";
import { db } from "init.js";

type Props = {
  solutionsAndFrequencies: AllTaskType[];
  days: number;
};

export default async function getRawSchedule({
  solutionsAndFrequencies,
  days,
}: Props) {
  try {
    const dateOne = new Date();
    const dateTwo = daysFrom({ days: days > 0 ? days : 7 });
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

    const sortedSchedule = turnTasksIntoSchedule({
      dateOne,
      dateTwo,
      earliestStartMap,
      solutionsAndFrequencies,
    });

    return sortedSchedule;
  } catch (error) {
    throw httpError(error);
  }
}
