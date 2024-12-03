import { NextActionType, ToAnalyzeType, TypeEnum } from "types.js";

type Props = {
  type: TypeEnum;
  toAnalyze: { head: ToAnalyzeType[]; body: ToAnalyzeType[] };
  nextScan: NextActionType;
};

export default function checkCanScan({ nextScan, toAnalyze, type }: Props) {
  const typeToAnalyze = toAnalyze[type as "head"];
  const typeScan = nextScan.find((obj) => obj.type === type);

  if (typeToAnalyze.length === 0) {
    if (typeScan.date > new Date()) {
      return {
        canScan: false,
        canScanDate: typeScan.date,
      };
    }
  }

  if (!typeScan.parts) {
    return {
      canScan: true,
      canScanDate: new Date(),
    };
  }

  let earliestCanScanDate = new Date();

  for (const analysis of typeToAnalyze) {
    const relevantPart = typeScan.parts.find(
      (obj) => obj.part === analysis.part
    );
    if (
      relevantPart.date > new Date() &&
      relevantPart.date < earliestCanScanDate
    ) {
      earliestCanScanDate = relevantPart.date;
    }
  }

  if (earliestCanScanDate > new Date()) {
    return { canScan: false, canScanDate: earliestCanScanDate };
  }

  return { canScan: true, canScanDate: new Date() };
}
