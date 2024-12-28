import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum, UserType } from "types.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

type Props = {
  userId: string;
  followingUserName: string;
  throwOnError?: boolean;
  targetProjection?: { [key: string]: any };
  userProjection?: { [key: string]: any };
};

export default async function checkTrackedRBAC({
  userId,
  throwOnError = false,
  followingUserName,
  targetProjection,
  userProjection,
}: Props) {
  try {
    const result = {
      isSelf: true,
      inClub: true,
      isFollowing: true,
      subscriptionActive: true,
      userInfo: null as Partial<UserType>,
      targetUserInfo: null as Partial<UserType>,
    };

    const targetFilter = {
      name: followingUserName,
      club: { $exists: true },
    };
    const targetOptions = { projection: { _id: 1 } };

    if (targetProjection)
      targetOptions.projection = {
        ...targetOptions.projection,
        ...targetProjection,
      };

    const targetUserInfo = await doWithRetries(async () =>
      db
        .collection("User")
        .findOne(
          { ...targetFilter, moderationStatus: ModerationStatusEnum.ACTIVE },
          targetOptions
        )
    );

    if (!targetUserInfo) {
      if (throwOnError) {
        throw httpError(
          `User ${userId} is trying to access user ${followingUserName} who is not in the club.`
        );
      }
      result.inClub = false;
    }

    if (String(targetUserInfo?._id) === userId) {
      result.isSelf = true;
      return result;
    }

    result.targetUserInfo = targetUserInfo;

    const userFilter = { _id: new ObjectId(userId) };
    const userOptions = {
      projection: {
        "club.followingUserName": 1,
        "subscriptions.peek": 1,
        name: 1,
      },
    };

    if (userProjection)
      userOptions.projection = {
        ...userOptions.projection,
        ...userProjection,
      };

    result.userInfo = await doWithRetries(async () =>
      db
        .collection("User")
        .findOne(
          { ...userFilter, moderationStatus: ModerationStatusEnum.ACTIVE },
          userOptions
        )
    );

    const { club, name, subscriptions } =
      (result.userInfo as unknown as Partial<UserType>) || {};

    const { peek } = subscriptions || {};
    const { validUntil } = peek || {};

    if (!validUntil || (validUntil && validUntil < new Date())) {
      if (throwOnError) {
        throw httpError(`The peek subscription of the ${userId} has expired.`);
      }
      result.subscriptionActive = false;
    }

    const { followingUserName: clubFollowingUserName } = club || {};

    if (clubFollowingUserName !== name) {
      if (throwOnError) {
        throw httpError(
          `User ${name} is trying to access user ${clubFollowingUserName} who is not their following.`
        );
      }
      result.isFollowing = false;
    }

    return result;
  } catch (err) {
    throw httpError(err);
  }
}
