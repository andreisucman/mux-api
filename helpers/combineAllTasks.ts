import { AllTaskType } from "@/types.js";

interface Props {
  oldAllTasks: AllTaskType[];
  newAllTasks: AllTaskType[];
}

// Deep merge function with handling for adding number fields
function deepMerge(target: any, source: any): any {
  // If both target and source are arrays, merge them (concatenate for arrays)
  if (Array.isArray(target) && Array.isArray(source)) {
    return [...target, ...source];
  }

  // If both target and source are objects, recursively merge them
  if (
    target &&
    typeof target === "object" &&
    source &&
    typeof source === "object"
  ) {
    const merged = { ...target };
    Object.keys(source).forEach((key) => {
      merged[key] = deepMerge(target[key], source[key]);
    });
    return merged;
  }

  // If both target and source are numbers, add them
  if (typeof target === "number" && typeof source === "number") {
    return target + source;
  }

  // If target and source are primitive or different types, replace target with source
  return source;
}

export default function combineAllTasks({ oldAllTasks, newAllTasks }: Props) {
  const mergedTasksMap = new Map<string, AllTaskType>();

  // First, add tasks from the oldAllTasks array to the map
  oldAllTasks.forEach((task) => {
    mergedTasksMap.set(task.key, { ...task });
  });

  // Now, merge tasks from the newAllTasks array
  newAllTasks.forEach((task) => {
    const existingTask = mergedTasksMap.get(task.key);
    if (existingTask) {
      // Perform a deep merge of the existing task with the new task
      mergedTasksMap.set(task.key, {
        ...existingTask,
        ...task,
        unknown: deepMerge(existingTask.unknown, task.unknown),
        completed: deepMerge(existingTask.completed, task.completed),
        total: deepMerge(existingTask.total, task.total),
        ids: deepMerge(existingTask.ids, task.ids),
      });
    } else {
      // If no existing task, simply add the new task
      mergedTasksMap.set(task.key, { ...task });
    }
  });

  // Convert the map back to an array and return the merged tasks
  return Array.from(mergedTasksMap.values());
}
