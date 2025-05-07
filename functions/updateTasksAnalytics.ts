import httpError from "@/helpers/httpError.js";
import updateAnalytics from "./updateAnalytics.js";
import { TaskType } from "@/types.js";

type Props = {
  tasksToInsert: Partial<TaskType>[];
  keyOne?: string;
  keyTwo?: string;
  userId: string;
};

export default async function updateTasksAnalytics({
  tasksToInsert,
  keyOne,
  keyTwo,
  userId,
}: Props) {
  try {
    const partsCreatedTasks = keyOne
      ? tasksToInsert
          .map((t) => t.part)
          .reduce((a: { [key: string]: number }, c: string) => {
            const key = `overview.user.tasks.part.${keyOne}.${c}`; // tasksCreated
            if (a[key]) {
              a[key] += 1;
            } else {
              a[key] = 1;
            }

            return a;
          }, {})
      : {};

    const partsCreatedManualTasks = keyTwo
      ? tasksToInsert
          .filter((t) => t.isCreated)
          .map((t) => t.part)
          .reduce((a: { [key: string]: number }, c: string) => {
            const key = `overview.user.tasks.part.${keyTwo}.${c}`; // manualTasksCreated
            if (a[key]) {
              a[key] += 1;
            } else {
              a[key] = 1;
            }

            return a;
          }, {})
      : {};

    updateAnalytics({
      userId: String(userId),
      incrementPayload: {
        [`overview.user.usage.tasks.${keyOne}`]: tasksToInsert.length,
        ...partsCreatedTasks,
        ...partsCreatedManualTasks,
      },
    });
  } catch (err) {
    throw httpError(err);
  }
}
