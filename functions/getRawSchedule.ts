import * as dotenv from "dotenv";
dotenv.config();

import { daysFrom } from "helpers/utils.js";
import turnTasksIntoSchedule from "helpers/turnTasksIntoSchedule.js";
import { AllTaskType } from "types.js";
import httpError from "helpers/httpError.js";
import setToMidnight from "@/helpers/setToMidnight.js";

type Props = {
  allTasks: AllTaskType[];
  routineStartDate: string;
  days: number;
  timeZone: string;
};

export default async function getRawSchedule({ allTasks, routineStartDate, timeZone, days }: Props) {
  try {
    const dateOne = setToMidnight({
      date: new Date(routineStartDate),
      timeZone,
    });

    const dateTwo = daysFrom({ date: dateOne, days: days > 0 ? days : 7 });

    const sortedSchedule = turnTasksIntoSchedule({
      dateOne,
      dateTwo,
      allTasks,
    });

    return sortedSchedule;
  } catch (error) {
    throw httpError(error);
  }
}
