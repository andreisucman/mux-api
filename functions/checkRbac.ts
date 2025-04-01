import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

type Props = {
  userId: string;
  sellerId: ObjectId;
  part?: string;
};

export default async function checkRbac({ part, userId, sellerId }: Props) {
  try {
    const filter: { [key: string]: any } = {
      buyerId: new ObjectId(userId),
      sellerId: new ObjectId(sellerId),
    };

    if (part) filter.part = part;

    const purchases = await doWithRetries(async () =>
      db
        .collection("Purchase")
        .find(filter, {
          projection: {
            contentEndDate: 1,
            part: 1,
          },
        })
        .toArray()
    );

    const priceData = await doWithRetries(async () =>
      db
        .collection("RoutineData")
        .find(
          { userId: new ObjectId(sellerId), status: "public" },
          {
            projection: { name: 1, description: 1, price: 1, part: 1 },
          }
        )
        .toArray()
    );

    const purchasedParts = purchases.map((obj) => obj.part);

    const notPurchased = priceData
      .filter((pd) => !purchasedParts.includes(pd.part))
      .map((obj) => obj.part);

    return { priceData, purchases, notPurchased };
  } catch (err) {
    throw httpError(err);
  }
}
