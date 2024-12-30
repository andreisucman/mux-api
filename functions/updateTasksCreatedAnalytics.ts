import httpError from "@/helpers/httpError.js";
import updateAnalytics from "./updateAnalytics.js";
import { TaskType } from "@/types.js";

export default async function updateTasksAnalytics(
  tasksToInsert: Partial<TaskType>[],
  keyOne: string,
  keyTwo: string
) {
  try {
    const partsCreatedTasks = tasksToInsert
      .map((t) => t.part)
      .reduce((a: { [key: string]: number }, c: string) => {
        const key = `overview.tasks.part.${keyOne}.${c}`; // tasksCreated
        if (a[key]) {
          a[key] += 1;
        } else {
          a[key] = 1;
        }

        return a;
      }, {});

    const partsCreatedManualTasks = tasksToInsert
      .filter((t) => t.isCreated)
      .map((t) => t.part)
      .reduce((a: { [key: string]: number }, c: string) => {
        const key = `overview.tasks.part.${keyTwo}.${c}`; // manuallyTasksCreated
        if (a[key]) {
          a[key] += 1;
        } else {
          a[key] = 1;
        }

        return a;
      }, {});

    updateAnalytics({
      [`overview.usage.${keyOne}`]: tasksToInsert.length,
      ...partsCreatedTasks,
      ...partsCreatedManualTasks,
    });
  } catch (err) {
    throw httpError(err);
  }
}
