import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import updateContentPublicity from "functions/updateContentPublicity.js";
import cancelSubscription from "functions/cancelSubscription.js";
import { defaultClubPrivacy } from "data/defaultClubPrivacy.js";
import httpError from "@/helpers/httpError.js";
import { daysFrom } from "@/helpers/utils.js";
import getUserInfo from "./getUserInfo.js";
import { db } from "init.js";

type Props = {
  userId: string;
};

export default async function removeFromClub({ userId }: Props) {
  try {
    await updateContentPublicity({ userId, newPrivacy: defaultClubPrivacy });

    const canRejoinClubAfter = daysFrom({ days: 7 });

    await doWithRetries(async () =>
      db
        .collection("User")
        .updateOne(
          { userId: new ObjectId(userId) },
          { $set: { club: null, name: null, canRejoinClubAfter } }
        )
    );

    await doWithRetries(async () =>
      db.collection("User").updateMany(
        { "club.followingUserId": new ObjectId(userId) },
        {
          $set: {
            "club.followingUserName": null,
            "club.followingUserId": null,
          },
        }
      )
    );

    const userInfo = await getUserInfo({
      userId,
      projection: { subscriptions: 1 },
    });

    if (!userInfo) throw httpError(`User: ${userId} not found.`);

    const relevantSubscription = userInfo.subscriptions.peek;

    await cancelSubscription(relevantSubscription.subscriptionId);

    const removeFromFollowHistoryBatch = [
      { deleteMany: { filter: { followingUserId: new ObjectId(userId) } } },
      { deleteMany: { filter: { userId: new ObjectId(userId) } } },
    ];

    doWithRetries(async () =>
      db.collection("FollowHistory").bulkWrite(removeFromFollowHistoryBatch)
    );
  } catch (err) {
    throw httpError(err);
  }
}
