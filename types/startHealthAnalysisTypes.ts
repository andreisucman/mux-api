import {
  ProgressType,
  ToAnalyzeType,
  UserConcernType,
  DemographicsType,
  NextActionType,
} from "@/types.js";

export type StartHealthAnalysisUserInfo = {
  requiredProgress: {
    health: ProgressType[];
  };
  toAnalyze: { health: ToAnalyzeType[] };
  concerns: UserConcernType[];
  demographics: DemographicsType;
  nextScan: NextActionType;
  specialConsiderations?: string;
};
