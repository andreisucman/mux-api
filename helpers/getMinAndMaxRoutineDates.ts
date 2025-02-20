import { AllTaskTypeWithIds } from "@/types.js";

export default function getMinAndMaxRoutineDates(
  allTasks: AllTaskTypeWithIds[]
) {
  const allTaskTimes = allTasks
    .flatMap((t) => t.ids)
    .map((idObjs) => new Date(idObjs.startsAt).getTime());

  const minDate = Math.round(Math.min(...allTaskTimes));

  const maxDate = Math.round(Math.max(...allTaskTimes));

  return { minDate, maxDate };
}
