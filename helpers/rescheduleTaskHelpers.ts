import { AllTaskIdType, AllTaskTypeWithIds } from "@/types.js";
import { ScheduleTaskType } from "./turnTasksIntoSchedule.js";

export const removeTaskFromSchedule = (taskKey: string, schedule: { [key: string]: ScheduleTaskType[] }) => {
  return Object.fromEntries(
    Object.entries(schedule)
      .map(([date, values]) => [date, values.filter((v) => v.key !== taskKey)])
      .filter(([date, tasks]) => tasks.length)
  );
};

export const removeTaskFromAllTasks = (taskKey: string, allTasks: AllTaskTypeWithIds[]) => {
  return allTasks.filter((at) => at.key !== taskKey);
};

export const addTaskToSchedule = (
  currentSchedule: { [key: string]: ScheduleTaskType[] },
  taskKey: string,
  taskConcern: string,
  updatedAllTaskIds: AllTaskIdType[]
) => {
  for (let i = 0; i < updatedAllTaskIds.length; i++) {
    const task = updatedAllTaskIds[i];
    const dateString = new Date(task.startsAt).toDateString();

    const simpleTaskContent = {
      _id: task._id,
      key: taskKey,
      concern: taskConcern,
    };

    if (currentSchedule[dateString]) {
      currentSchedule[dateString].push(simpleTaskContent);
    } else {
      currentSchedule[dateString] = [simpleTaskContent];
    }
  }

  return { ...currentSchedule };
};

export const addTaskToAllTasks = (newAllTask: AllTaskTypeWithIds, currentAllTasks: AllTaskTypeWithIds[]) => {
  const alreadyExists = currentAllTasks.some((t) => t.key === newAllTask.key);

  if (alreadyExists) {
    return currentAllTasks.map((at) => (at.key === newAllTask.key ? newAllTask : at));
  } else {
    return [...currentAllTasks, newAllTask];
  }
};
