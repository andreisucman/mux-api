import { PartEnum, NextActionType } from "types.js";
import { daysFrom } from "helpers/utils.js";
import httpError from "./httpError.js";

type Props = {
  parts: PartEnum[];
  nextRun: NextActionType[];
};

export default function updateNextRun({ nextRun, parts }: Props) {
  try {
    const newDate = daysFrom({ days: 7 });

    for (const part of parts) {
      let relevantPart = nextRun.find((obj) => obj.part === part);
      if (relevantPart) {
        relevantPart.date = newDate;
      }
    }

    nextRun.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    return nextRun;
  } catch (err) {
    throw httpError(err);
  }
}
