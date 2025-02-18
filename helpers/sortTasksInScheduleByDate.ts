import { ScheduleTaskType } from "./turnTasksIntoSchedule.js";

export default function sortTasksInScheduleByDate(schedule: {
  [key: string]: ScheduleTaskType[];
}) {
  const keys = Object.keys(schedule).filter(
    (key) => !isNaN(new Date(key).getTime())
  );

  return keys
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .reduce((acc: { [key: string]: ScheduleTaskType[] }, key) => {
      acc[key] = schedule[key];
      return acc;
    }, {});
}
