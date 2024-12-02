import { TypeEnum, PartEnum } from "@/types.js";

export type RequiredProgressType = {
  type: TypeEnum | null;
  title: string;
  instruction: string;
  position: string;
  part: PartEnum | null;
};

import {
  ToAnalyzeType,
  UserConcernType,
  UserProgressRecordType,
  ClubDataType,
  DemographicsType,
  UserPotentialRecordType,
  LatestScoresType,
  HigherThanType,
  NextActionType,
} from "types.js";

export type UploadProgressUserInfo = {
  requiredProgress: {
    head: RequiredProgressType[];
    body: RequiredProgressType[];
  };
  toAnalyze: { head: ToAnalyzeType[]; body: ToAnalyzeType[] };
  concerns: UserConcernType[];
  demographics: DemographicsType;
  potential: UserPotentialRecordType;
  city: string;
  country: string;
  timeZone: string;
  currentlyHigherThan: HigherThanType;
  potentiallyHigherThan: HigherThanType;
  nextScan: NextActionType;
  specialConsiderations?: string;
  latestProgress: UserProgressRecordType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  club: ClubDataType;
};
