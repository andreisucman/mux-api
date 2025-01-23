import { AllTaskType, TaskStatusEnum, TaskType } from "@/types.js";

type Props = {
  allTasksWithoutDates: AllTaskType[];
  tasksToInsert: Partial<TaskType>[];
};

export default function addDateAndIdsToAllTasks({
  allTasksWithoutDates,
  tasksToInsert,
}: Props) {
  const allTasksWithDates = [...allTasksWithoutDates].map((obj) => {
    const { key } = obj;
    const filteredTasks = tasksToInsert.filter((t) => t.key === key);

    const newIds = filteredTasks.map((t) => {
      const newIo = {
        _id: t._id,
        startsAt: t.startsAt,
        status: TaskStatusEnum.ACTIVE,
      };

      return newIo;
    });

    return { ...obj, ids: newIds, total: filteredTasks.length };
  });

  return allTasksWithDates;
}
