import { PartEnum, NextActionType } from "types.js";
import { daysFrom } from "helpers/utils.js";
import httpError from "./httpError.js";

type Props = {
  parts: PartEnum[];
  nextRuns: NextActionType[];
};

export default function updateNextRun({ nextRuns, parts }: Props) {
  try {
    const newDate = daysFrom({ days: 7 });

    for (const part of parts) {
      let relevantPart = nextRuns.find((obj) => obj.part === part);
      if (relevantPart) {
        relevantPart.date = newDate;
      }
    }

    nextRuns.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    return nextRuns;
  } catch (err) {
    throw httpError(err);
  }
}
