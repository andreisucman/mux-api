import { ObjectId } from "mongodb";
import { ClubDataType, LatestScoresType } from "types.js";

export type GetClubYouTrackUserType = {
  _id: ObjectId;
  club: ClubDataType;
  city: string;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
};
