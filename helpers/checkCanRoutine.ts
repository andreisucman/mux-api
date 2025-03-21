import { NextActionType } from "types.js";

type Props = {
  nextRoutine: NextActionType[];
};

export default function checkCanRoutine({ nextRoutine }: Props) {
  const availableRoutines = nextRoutine.filter(
    (routine) => !routine.date || new Date(routine.date) < new Date()
  );

  const unavailableRoutines = nextRoutine.filter(
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
