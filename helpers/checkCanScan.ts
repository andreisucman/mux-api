import { NextActionType, ToAnalyzeType } from "types.js";

type Props = {
  toAnalyze: ToAnalyzeType[];
  nextScan: NextActionType[];
};

export default function checkCanScan({ nextScan, toAnalyze }: Props) {
  const canScanParts = nextScan
    .filter((scan) => !scan.date || scan.date > new Date())
    .map((obj) => obj.part);

  const filteredToAnalyze = toAnalyze.filter((taObj) =>
    canScanParts.includes(taObj.part)
  );

  const canScanDate =
    nextScan && nextScan.length
      ? Math.min(
          ...nextScan.map((r) =>
            r.date ? new Date(r.date).getTime() : Infinity
          )
        )
      : null;

  return {
    canScan: canScanParts.length > 0,
    filteredToAnalyze,
    canScanDate: new Date(Math.round(canScanDate)),
  };
}
