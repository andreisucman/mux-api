import { PartEnum, NextActionType } from "types.js";
import { daysFrom } from "helpers/utils.js";
import httpError from "./httpError.js";

type Props = {
  parts: PartEnum[];
  nextRoutine: NextActionType[];
};

export default function updateNextRoutine({ nextRoutine, parts }: Props) {
  try {
    const newDate = daysFrom({ days: 7 });

    for (const part of parts) {
      let relevantPart = nextRoutine.find((obj) => obj.part === part);
      if (relevantPart) {
        relevantPart.date = newDate;
      }
    }

    nextRoutine.sort(
      (a, b) =>
        new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
    );

    return nextRoutine;
  } catch (err) {
    throw httpError(err);
  }
}
