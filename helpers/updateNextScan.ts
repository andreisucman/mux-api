import { daysFrom } from "@/helpers/utils.js";
import { NextActionType, ToAnalyzeType } from "types.js";

type Props = {
  nextScan: NextActionType[];
  toAnalyze: ToAnalyzeType[];
};

export default function updateNextScan({ nextScan, toAnalyze }: Props) {
  const newDate = daysFrom({ days: 7 });

  const updatedNextScan = nextScan.map((obj) => {
    const toAnalyzeObject = toAnalyze.find((item) => item.part === obj.part);
    return toAnalyzeObject ? { ...obj, date: newDate } : obj;
  });

  return [...updatedNextScan].sort((a, b) => {
    if (a.date === null && b.date === null) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}
