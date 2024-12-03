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

    await doWithRetries({
      functionName: "removeFromClub - unset club",
      functionToExecute: async () =>
        db
          .collection("User")
          .updateOne({ _id: new ObjectId(userId) }, { $unset: { club: null } }),
    });

    await doWithRetries({
      functionName: "removeFromClub - remove from tracking",
      functionToExecute: async () =>
        db
          .collection("User")
          .updateMany(
            { "club.trackedUserId": userId },
            { $unset: { "club.trackedUserId": "" } }
          ),
    });

    /* cancel the peek subscription */
    const userInfo = (await doWithRetries({
      functionName: "removeFromClub - unset club",
      functionToExecute: async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(userId) },
            { projection: { subscriptions: 1 } }
          ),
    })) as any;

    if (!userInfo) throw httpError(`User: ${userId} not found.`);

    const relevantSubscription = userInfo.subscriptions.peek;

    await cancelSubscription(relevantSubscription.subscriptionId);

    const removeFromFollowHistoryBatch = [
      { deleteMany: { filter: { trackedUserId: new ObjectId(userId) } } },
      { deleteMany: { filter: { userId: new ObjectId(userId) } } },
    ];

    doWithRetries({
      functionName: "removeFromClub - remove from follow history",
      functionToExecute: async () =>
        db.collection("FollowHistory").bulkWrite(removeFromFollowHistoryBatch),
    }).catch();
  } catch (err) {
    throw httpError(err);
  }
}
