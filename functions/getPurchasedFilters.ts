import httpError from "@/helpers/httpError.js";
import getUserInfo from "./getUserInfo.js";
import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

type Props = {
  userName: string;
  userId: string;
  concern?: string;
  part?: string;
};

export type PurchaseType = { concern: string; part: string; contentEndDate: Date };
export type PriceDataType = { name: string; description: string; price: number; concern: string; part: string };

export default async function getPurchasedFilters({ userName, userId, concern, part }: Props) {
  const additionalFilters: { [key: string]: any } = {};
  let purchases: PurchaseType[] = [];
  let priceData: PriceDataType[] = [];
  let notPurchased: string[] = [];

  additionalFilters.userName = userName;

  try {
    const sellerIdObj = await getUserInfo({
      userName,
      projection: { _id: 1 },
    });

    priceData = await doWithRetries(
      async () =>
        db
          .collection("RoutineData")
          .find(
            { userId: new ObjectId(sellerIdObj?._id), status: "public" },
            {
              projection: { name: 1, description: 1, price: 1, concern: 1, part: 1 },
            }
          )
          .toArray() as unknown as PriceDataType[]
    );

    if (!userId) {
      notPurchased = priceData.map((obj) => `${obj.part}-${obj.concern}`);
      return { purchases, priceData, notPurchased, additionalFilters };
    }

    const filter: { [key: string]: any } = {
      buyerId: new ObjectId(userId),
      sellerId: new ObjectId(sellerIdObj._id),
    };

    if (concern) filter.concern = concern;
    if (part) filter.part = part;

    purchases = await doWithRetries(
      async () =>
        db
          .collection("Purchase")
          .find(filter, {
            projection: {
              contentEndDate: 1,
              concern: 1,
              part: 1,
            },
          })
          .toArray() as unknown as PurchaseType[]
    );

    const purchasedCombinatons = purchases.map((obj) => `${obj.part}-${obj.concern}`);
    const soldCombinations = priceData.map((obj) => `${obj.part}-${obj.concern}`);

    notPurchased = soldCombinations.filter((sc) => !purchasedCombinatons.includes(sc));

    // if (purchases.length) {
    //   const purchasedConcerns = [];
    //   const withinPurchasedPeriod: { [key: string]: any } = {};

    //   for (const obj of purchases) {
    //     const { contentEndDate, concern: purchassedConcern } = obj;
    //     purchasedConcerns.push(purchassedConcern);
    //     withinPurchasedPeriod.$lte = new Date(contentEndDate);
    //   }

    //   additionalFilters.concern = { $in: purchasedConcerns };
    //   additionalFilters.createdAt = withinPurchasedPeriod;
    // }

    // return { purchases, priceData, notPurchasedConcerns, notPurchasedParts, additionalFilters };
    return { purchases, priceData, notPurchased };
  } catch (err) {
    throw httpError(err);
  }
}
