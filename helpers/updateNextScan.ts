import { TypeEnum, ToAnalyzeType, NextActionType } from "types.js";
import { daysFrom } from "helpers/utils.js";

type Props = {
  type: TypeEnum;
  nextScan: NextActionType;
  toAnalyze: { head: ToAnalyzeType[]; body: ToAnalyzeType[] };
};

export default function updateNextScan({ nextScan, toAnalyze, type }: Props) {
  try {
    let newTypeNextScan = {
      ...(nextScan.find((rec) => rec.type === type) || {}),
    };

    const typeToAnalyze = toAnalyze[type as "head"] || [];

    let newParts = [...(newTypeNextScan.parts || [])];

    const newDate = daysFrom({ days: 7 });

    for (const toAnalyzeObject of typeToAnalyze) {
      let relevantPart = newParts.find(
        (obj) => obj.part === toAnalyzeObject.part
      );
      if (relevantPart) relevantPart.date = newDate;
    }

    newParts.sort((a, b) => {
      if (a.date === null && b.date === null) return 0;
      if (a.date === null) return 1;
      if (b.date === null) return -1;

      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    newTypeNextScan.parts = newParts;
    newTypeNextScan.date = newParts[0]?.date;

    return nextScan.map((rec) => (rec.type === type ? newTypeNextScan : rec));
  } catch (err) {
    console.log("Error in updateNextScan: ", err);
    throw err;
  }
}
