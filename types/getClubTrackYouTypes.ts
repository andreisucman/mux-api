import { LatestScoresType, PrivacyType } from "types.js";

type TrackerClubDataType = {
  about: string;
  name: string;
  privacy: PrivacyType[];
  avatar: { [key: string]: any };
};

export type TrackerType = {
  club: TrackerClubDataType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
};
