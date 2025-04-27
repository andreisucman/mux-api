import { AllTaskType } from "@/types.js";
import generateTaskIntervals from "./generateTaskIntervals.js";
import sortTasksInScheduleByDate from "./sortTasksInScheduleByDate.js";

type TurnTasksIntoScheduleProps = {
  allTasks: AllTaskType[];
  dateOne: Date;
  dateTwo: Date;
};

export type ScheduleTaskType = {
  date?: string;
  key: string;
  concern: string;
};

export default function turnTasksIntoSchedule({ allTasks, dateOne, dateTwo }: TurnTasksIntoScheduleProps) {
  const scheduleTasks: ScheduleTaskType[] = [];

  allTasks.forEach((solution) => {
    const intervals = generateTaskIntervals({
      total: solution.total,
      dateOne,
      dateTwo,
    });

    if (intervals) {
      for (let i = 0; i < intervals.length; i++) {
        scheduleTasks.push({
          date: intervals[i],
          key: solution.key,
          concern: solution.concern,
        });
      }
    }
  });

  const schedule = scheduleTasks.reduce((acc: { [key: string]: ScheduleTaskType[] }, current) => {
    const { date, ...otherCurrent } = current;
    if (acc[date]) {
      acc[date].push(current);
    } else {
      acc[date] = [otherCurrent];
    }
    return acc;
  }, {});

  const sortedSchedule = sortTasksInScheduleByDate(schedule);

  return sortedSchedule;
}
