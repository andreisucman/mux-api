import { ObjectId } from "mongodb";
import getUserInfo from "./getUserInfo.js";
import { SubscriptionType } from "@/types.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";
import { defaultTriedSubscriptions } from "@/data/defaultUser.js";

type TransferTrialsProps = {
  twinIds: string[];
  newUserId: string;
};

export default async function transferTrials({
  twinIds,
  newUserId,
}: TransferTrialsProps) {
  try {
    const existingUserInfo = await doWithRetries(() =>
      db
        .collection("User")
        .find(
          { _id: { $in: twinIds.map((id) => new ObjectId(id)) } },
          {
            projection: { subscriptions: 1 },
          }
        )
        .sort({ createdAt: -1 })
        .next()
    );

    const { subscriptions: existingSubscriptions } = existingUserInfo || {
      subscriptions: defaultTriedSubscriptions,
    };

    const newUserInfo = await getUserInfo({
      userId: String(newUserId),
      projection: { subscriptions: 1 },
    });

    const { subscriptions: newSubscriptions } = newUserInfo;

    const updatedSubscriptions = Object.keys(newSubscriptions).reduce(
      (a: { [key: string]: SubscriptionType }, c: string) => {
        a[c] = newSubscriptions[c as "improvement"];

        if (!a[c].isTrialUsed) {
          a[c].isTrialUsed =
            existingSubscriptions[c as "improvement"].isTrialUsed;
        }
        return a;
      },
      {} as { [key: string]: SubscriptionType }
    );

    await doWithRetries(async () =>
      db
        .collection("User")
        .updateOne(
          { _id: new ObjectId(newUserId) },
          { $set: { subscriptions: updatedSubscriptions } }
        )
    );
  } catch (err) {
    throw httpError(err);
  }
}
