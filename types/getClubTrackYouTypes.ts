import { LatestScoresType, PrivacyType } from "types.js";

export type TrackerType = {
  _id: 1;
  name: string;
  avatar: { [key: string]: any };
  club: { privacy: PrivacyType[]; bio: { about: String } };
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
};
