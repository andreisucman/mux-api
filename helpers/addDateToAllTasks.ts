import { AllTaskType, TaskType } from "@/types.js";

type Props = {
  allTasksWithoutDates: AllTaskType[];
  tasksToInsert: Partial<TaskType>[];
};

export default function addDateToAllTaskIds({
  allTasksWithoutDates,
  tasksToInsert,
}: Props) {
  const allTasksWithDates = [...allTasksWithoutDates].map((obj) => {
    const { ids } = obj;
    const newIds = ids.map((io) => {
      const relevantTask = tasksToInsert.find(
        (t) => String(t._id) === String(io._id)
      );

      if (!relevantTask) return null;

      const newIo = { ...io, startsAt: relevantTask.startsAt };

      return newIo;
    });

    return { ...obj, ids: newIds.filter(Boolean) };
  });

  return allTasksWithDates;
}
