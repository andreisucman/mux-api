import { ScheduleTaskType } from "./turnTasksIntoSchedule.js";

export default function sortTasksInScheduleByDate(schedule: {
  [key: string]: ScheduleTaskType[];
}) {
  try {
    const keys = Object.keys(schedule);
    const sortedSchedule = keys
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .reduce((acc: { [key: string]: ScheduleTaskType[] }, key) => {
        if (schedule[key]) acc[key] = schedule[key];
        return acc;
      }, {});
    return sortedSchedule;
  } catch (err) {
    throw new Error(`sortTasksInScheduleByDate - ${err.message}`);
  }
}
