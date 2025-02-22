import { db } from "@/init.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId?: string;
};

export default async function findLatestRewards({ userId }: Props) {
  try {
    const pipeline = [];

    const match: { [key: string]: any } = { isActive: true };

    if (userId) {
      const cooldownRecords = await doWithRetries(async () =>
        db
          .collection("RewardCooldown")
          .find(
            {
              userId: new ObjectId(userId),
              availableFrom: { $gt: new Date() },
            },
            { projection: { rewardId: 1 } }
          )
          .toArray()
      );

      if (cooldownRecords.length > 0) {
        match._id = { $nin: cooldownRecords.map((rec) => rec.rewardId) };
      }
    }

    pipeline.push({ $match: match });
    pipeline.push({ $sort: { key: 1, value: 1 } });
    pipeline.push(
      {
        $group: {
          _id: "$key",
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } }
    );
    pipeline.push({ $sort: { key: 1, value: 1 } });

    const rewards = await doWithRetries(async () =>
      db.collection("Reward").aggregate(pipeline).toArray()
    );

    return rewards;
  } catch (err) {
    throw httpError(err);
  }
}
