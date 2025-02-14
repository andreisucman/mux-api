import { PartEnum } from "@/types.js";

export type FeatureAnalysisResultType = {
  score: number;
  explanation: string;
  feature: string;
  part: PartEnum;
};
