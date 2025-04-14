import httpError from "@/helpers/httpError.js";
import getUserInfo from "./getUserInfo.js";
import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

type Props = {
  userName: string;
  userId: string;
  concern?: string;
};

export default async function getPurchasedFilters({ userName, userId, concern }: Props) {
  const additionalFilters: { [key: string]: any } = {};
  let purchases = [];
  let priceData = [];
  let notPurchased = [];

  additionalFilters.userName = userName;

  try {
    const sellerIdObj = await getUserInfo({
      userName,
      projection: { _id: 1 },
    });

    priceData = await doWithRetries(async () =>
      db
        .collection("RoutineData")
        .find(
          { userId: new ObjectId(sellerIdObj?._id), status: "public" },
          {
            projection: { name: 1, description: 1, price: 1, concern: 1 },
          }
        )
        .toArray()
    );

    if (!userId) {
      notPurchased = priceData.map((obj) => obj.concern);
      return { purchases, priceData, notPurchased, additionalFilters };
    }

    const filter: { [key: string]: any } = {
      buyerId: new ObjectId(userId),
      sellerId: new ObjectId(sellerIdObj._id),
    };

    if (concern) filter.concern = concern;

    purchases = await doWithRetries(async () =>
      db
        .collection("Purchase")
        .find(filter, {
          projection: {
            contentEndDate: 1,
            concern: 1,
          },
        })
        .toArray()
    );

    const purchasedParts = purchases.map((obj) => obj.part);

    notPurchased = priceData.filter((pd) => !purchasedParts.includes(pd.concern)).map((obj) => obj.concern);

    if (purchases.length) {
      const purchasedConcerns = [];
      const withinPurchasedPeriod: { [key: string]: any } = {};

      for (const obj of purchases) {
        const { contentEndDate, concern: purchassedConcern } = obj;
        purchasedConcerns.push(purchassedConcern);
        withinPurchasedPeriod.$lte = new Date(contentEndDate);
      }

      additionalFilters.concern = { $in: purchasedConcerns };
      additionalFilters.createdAt = withinPurchasedPeriod;
    }

    return { purchases, priceData, notPurchased, additionalFilters };
  } catch (err) {
    throw httpError(err);
  }
}
