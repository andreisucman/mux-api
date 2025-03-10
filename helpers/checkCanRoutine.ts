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

  const availableRoutines = relevantRoutines.filter(
    (routine) => !routine.date || new Date(routine.date) < new Date()
  );

  const unavailableRoutines = relevantRoutines.filter(
    (routine) => routine.date || new Date(routine.date) > new Date()
  );

  const canRoutineDate = Math.min(
    ...unavailableRoutines.map((r) =>
      r.date ? new Date(r.date).getTime() : Infinity
    )
  );

  return {
    canRoutineDate,
    availableRoutines,
    unavailableRoutines,
  };
}
