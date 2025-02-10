import { TypeEnum, PartEnum } from "@/types.js";

export type FeatureAnalysisResultType = {
  score: number;
  explanation: string;
  suggestion: string;
  feature: string;
  part: PartEnum;
};
