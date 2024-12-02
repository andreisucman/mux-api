import { TypeEnum } from "@/types.js";

export type FeatureAnalysisType = {
  type: TypeEnum;
  feature: string;
  score: number;
  explanation: string;
};
