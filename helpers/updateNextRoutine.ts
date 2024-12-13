import { TypeEnum, PartEnum, NextActionType } from "types.js";
import { daysFrom } from "helpers/utils.js";
import httpError from "./httpError.js";

type Props = {
  type: TypeEnum;
  parts: PartEnum[];
  nextRoutine: NextActionType;
};

export default function updateNextRoutine({ nextRoutine, type, parts }: Props) {
  try {
    let newTypeNextRoutine = {
      ...(nextRoutine.find((obj) => obj.type === type) || {
        parts: [],
        date: new Date(),
      }),
    };

    let newParts = [...(newTypeNextRoutine.parts || [])];
    const newDate = daysFrom({ days: 7 });

    for (const part of parts) {
      let relevantPart = newParts.find((obj) => obj.part === part);
      if (relevantPart) {
        relevantPart.date = newDate;
      }
    }

    newParts.sort(
      (a, b) =>
        new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
    );

    newTypeNextRoutine.parts = newParts;
    newTypeNextRoutine.date = newParts[0]?.date;

    return nextRoutine.map((obj) =>
      obj.type === type ? newTypeNextRoutine : obj
    );
  } catch (err) {
    throw httpError(err);
  }
}
