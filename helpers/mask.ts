import { RoutineType } from "@/types.js";

export function maskAllTasks(routine: RoutineType) {
  return {
    ...routine,
    allTasks: routine.allTasks.map((t) => ({
      ...t,
      icon: "❓",
      name: Array(t.name.length).fill("*").join(""),
      key: Array(t.key.length).fill("*").join(""),
      ids: t.ids.map((obj) => ({ ...obj, _id: null })),
    })),
  };
}
