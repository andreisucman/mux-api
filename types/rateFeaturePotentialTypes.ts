
import { TypeEnum } from "@/types.js";

export type FeaturePotentialAnalysisType = {
  score: number;
  explanation: string;
  feature: string;
  type: TypeEnum;
};
