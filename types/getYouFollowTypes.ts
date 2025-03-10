import { ObjectId } from "mongodb";
import { ClubDataType, LatestScoresType } from "types.js";

export type GetYouFollowUserType = {
  _id: ObjectId;
  name: string;
  avatar: { [key: string]: any };
  club: ClubDataType;
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
};
