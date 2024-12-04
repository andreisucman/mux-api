import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { UserType } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  followingUserId: string;
  targetProjection?: { [key: string]: any };
  userProjection?: { [key: string]: any };
};

export default async function checkTrackedRBAC({
  userId,
  followingUserId,
  targetProjection,
  userProjection,
}: Props) {
  try {
    const targetFilter = {
      _id: new ObjectId(followingUserId),
      club: { $exists: true },
    };
    const targetOptions = { projection: { _id: 1 } };

    if (targetProjection)
      targetOptions.projection = {
        ...targetOptions.projection,
        ...targetProjection,
      };

    const targetUserInfo = await doWithRetries(async () =>
      db.collection("User").findOne(targetFilter, targetOptions)
    );

    if (!targetUserInfo)
      throw httpError(
        `User ${userId} is trying to access user ${followingUserId} who is not in the club.`
      );

    const userFilter = { _id: new ObjectId(userId) };
    const userOptions = { projection: { club: 1 } };

    if (userProjection)
      userOptions.projection = {
        ...userOptions.projection,
        ...userProjection,
      };

    const userInfo = await doWithRetries(async () =>
      db.collection("User").findOne(userFilter, userOptions)
    );

    const { club } = (userInfo as unknown as Partial<UserType>) || {};

    const { followingUserId: clubFollowingUserId } = club || {};

    if (followingUserId !== clubFollowingUserId)
      throw httpError(
        `User ${userId} is trying to access user ${followingUserId} who is not their following.`
      );

    return { userInfo, targetUserInfo };
  } catch (err) {
    throw httpError(err);
  }
}
