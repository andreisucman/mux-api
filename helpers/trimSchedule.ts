import { ScheduleTaskType } from "./turnTasksIntoSchedule.js";

type TrimScheduleProps = {
  days: number;
  schedule: { [key: string]: ScheduleTaskType[] };
  concernsNamesDescending: string[];
  toDeleteCount: number;
};

export default function trimSchedule({
  days,
  schedule,
  concernsNamesDescending,
  toDeleteCount,
}: TrimScheduleProps) {
  const averageTasksPerDay = Math.round(
    Number(process.env.MAX_TASKS_PER_SCHEDULE) / days
  );

  for (
    let concernIndex = 0;
    concernIndex < concernsNamesDescending.length && toDeleteCount > 0;
    concernIndex++
  ) {
    const concernToDelete = concernsNamesDescending[concernIndex];

    Object.keys(schedule).forEach((key) => {
      const tasks = schedule[key];
      if (tasks.length > averageTasksPerDay && toDeleteCount > 0) {
        // Iterate through tasks and remove those with the matching concern
        for (let i = tasks.length - 1; i >= 0 && toDeleteCount > 0; i--) {
          if (tasks[i].concern === concernToDelete) {
            tasks.splice(i, 1);
            toDeleteCount--;
          }
        }
      }
    });
  }

  return schedule;
}
