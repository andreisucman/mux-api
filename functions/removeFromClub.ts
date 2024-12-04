import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateContentPublicity from "functions/updateContentPublicity.js";
import cancelSubscription from "functions/cancelSubscription.js";
import { defaultClubPrivacy } from "data/defaultClubPrivacy.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
};

export default async function removeFromClub({ userId }: Props) {
  try {
    await updateContentPublicity({ userId, newPrivacy: defaultClubPrivacy });

    await doWithRetries(async () =>
      db
        .collection("User")
        .updateOne({ _id: new ObjectId(userId) }, { $unset: { club: null } })
    );

    await doWithRetries(async () =>
      db
        .collection("User")
        .updateMany(
          { "club.followingUserId": userId },
          { $unset: { "club.followingUserId": "" } }
        )
    );

    /* cancel the peek subscription */
    const userInfo = (await doWithRetries(async () =>
      db
        .collection("User")
        .updateOne(
          { _id: new ObjectId(userId) },
          { projection: { subscriptions: 1 } }
        )
    )) as any;

    if (!userInfo) throw httpError(`User: ${userId} not found.`);

    const relevantSubscription = userInfo.subscriptions.peek;

    await cancelSubscription(relevantSubscription.subscriptionId);

    const removeFromFollowHistoryBatch = [
      { deleteMany: { filter: { followingUserId: new ObjectId(userId) } } },
      { deleteMany: { filter: { userId: new ObjectId(userId) } } },
    ];

    doWithRetries(async () =>
      db.collection("FollowHistory").bulkWrite(removeFromFollowHistoryBatch)
    ).catch();
  } catch (err) {
    throw httpError(err);
  }
}
