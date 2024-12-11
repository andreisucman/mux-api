import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { UserType } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  followingUserId: string;
  throwOnError?: boolean;
  targetProjection?: { [key: string]: any };
  userProjection?: { [key: string]: any };
};

export default async function checkTrackedRBAC({
  userId,
  throwOnError = false,
  followingUserId,
  targetProjection,
  userProjection,
}: Props) {
  try {
    const result = {
      inClub: true,
      isFollowing: true,
      userInfo: null as Partial<UserType>,
      targetUserInfo: null as Partial<UserType>,
    };

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

    if (!targetUserInfo) {
      if (throwOnError) {
        throw httpError(
          `User ${userId} is trying to access user ${followingUserId} who is not in the club.`
        );
      }
      result.inClub = false;
    }

    result.targetUserInfo = targetUserInfo;

    const userFilter = { _id: new ObjectId(userId) };
    const userOptions = { projection: { club: 1 } };

    if (userProjection)
      userOptions.projection = {
        ...userOptions.projection,
        ...userProjection,
      };

    result.userInfo = await doWithRetries(async () =>
      db.collection("User").findOne(userFilter, userOptions)
    );

    const { club } = (result.userInfo as unknown as Partial<UserType>) || {};

    const { followingUserId: clubFollowingUserId } = club || {};

    if (followingUserId !== String(clubFollowingUserId)) {
      if (throwOnError) {
        throw httpError(
          `User ${userId} is trying to access user ${followingUserId} who is not their following.`
        );
      }
      result.isFollowing = false;
    }

    return result;
  } catch (err) {
    throw httpError(err);
  }
}
