import { AllTaskType } from "@/types.js";
import { ObjectId } from "mongodb";
import generateTaskIntervals from "./generateTaskIntervals.js";
import sortTasksInScheduleByDate from "./sortTasksInScheduleByDate.js";

type TurnTasksIntoScheduleProps = {
  solutionsAndFrequencies: AllTaskType[];
  dateOne: Date;
  dateTwo: Date;
  earliestStartMap: { [key: string]: any };
};

export type ScheduleTaskType = {
  _id: ObjectId;
  date?: string;
  key: string;
  concern: string;
};

export default function turnTasksIntoSchedule({
  solutionsAndFrequencies,
  earliestStartMap,
  dateOne,
  dateTwo,
}: TurnTasksIntoScheduleProps) {
  const scheduleTasks: ScheduleTaskType[] = [];

  solutionsAndFrequencies.forEach((solution) => {
    const intervals = generateTaskIntervals({
      key: solution.key,
      total: solution.total,
      earliestStartMap,
      dateOne,
      dateTwo,
    });

    if (intervals) {
      for (let i = 0; i < intervals.length; i++) {
        scheduleTasks.push({
          _id: solution.ids[i]._id,
          date: intervals[i],
          key: solution.key,
          concern: solution.concern,
        });
      }
    }
  });

  const schedule = scheduleTasks.reduce(
    (acc: { [key: string]: ScheduleTaskType[] }, current) => {
      const { date, ...otherCurrent } = current;
      if (acc[date]) {
        acc[date].push(otherCurrent);
      } else {
        acc[date] = [otherCurrent];
      }
      return acc;
    },
    {}
  );

  const sortedSchedule = sortTasksInScheduleByDate(schedule);

  return sortedSchedule;
}
