import { NextActionType } from "types.js";

type Props = {
  nextScan: NextActionType[];
  nextRoutine: NextActionType[];
};

export default function checkCanRoutine({ nextScan, nextRoutine }: Props) {
  const validScanParts = nextScan.filter((obj) => obj.date);
  const validScanPartKeys = validScanParts.map((ob) => ob.part);

  const relevantRoutines = nextRoutine.filter((rt) =>
    validScanPartKeys.includes(rt.part)
  );

  const availableRoutines = relevantRoutines
    .filter((routine) => !routine.date || new Date(routine.date) < new Date())
    .map((obj) => obj.part);

  let canRoutineDate = new Date().getTime();

  if (availableRoutines.length === 0) {
    canRoutineDate = Math.min(
      ...relevantRoutines.map((r) =>
        r.date ? new Date(r.date).getTime() : Infinity
      )
    );
  }

  return {
    canRoutine: availableRoutines.length > 0,
    availableRoutines,
    canRoutineDate: new Date(Math.round(canRoutineDate)),
  };
}
