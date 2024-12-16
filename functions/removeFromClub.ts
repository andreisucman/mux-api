import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateContentPublicity from "functions/updateContentPublicity.js";
import cancelSubscription from "functions/cancelSubscription.js";
import { defaultClubPrivacy } from "data/defaultClubPrivacy.js";
import httpError from "@/helpers/httpError.js";
import { daysFrom } from "@/helpers/utils.js";
import getUserInfo from "./getUserInfo.js";

type Props = {
  userName: string;
};

export default async function removeFromClub({ userName }: Props) {
  try {
    await updateContentPublicity({ userName, newPrivacy: defaultClubPrivacy });

    const canRejoinClubAfter = daysFrom({ days: 7 });

    await doWithRetries(async () =>
      db
        .collection("User")
        .updateOne(
          { name: userName },
          { $set: { club: null, canRejoinClubAfter } }
        )
    );

    await doWithRetries(async () =>
      db.collection("User").updateMany(
        { "club.followingUserName": userName },
        {
          $set: {
            "club.followingUserName": null,
            "club.followingUserId": null,
          },
        }
      )
    );

    const userInfo = await getUserInfo({
      userName,
      projection: { subscriptions: 1 },
    });

    if (!userInfo) throw httpError(`User: ${userName} not found.`);

    const relevantSubscription = userInfo.subscriptions.peek;

    await cancelSubscription(relevantSubscription.subscriptionId);

    const removeFromFollowHistoryBatch = [
      { deleteMany: { filter: { followingUserName: userName } } },
      { deleteMany: { filter: { userName } } },
    ];

    doWithRetries(async () =>
      db.collection("FollowHistory").bulkWrite(removeFromFollowHistoryBatch)
    );
  } catch (err) {
    throw httpError(err);
  }
}
