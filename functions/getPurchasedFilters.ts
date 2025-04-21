import httpError from "@/helpers/httpError.js";
import getUserInfo from "./getUserInfo.js";
import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { RoutineDataStatsType } from "@/routes/saveRoutineData.js";

type Props = {
  userName: string;
  userId: string;
  concern?: string;
  part?: string;
};

export type PurchaseType = { concern: string; part: string; contentEndDate: Date };
export type PriceDataType = {
  name: string;
  description: string;
  price: number;
  concern: string;
  part: string;
  stats: RoutineDataStatsType;
};

export default async function getPurchasedFilters({ userName, userId, concern, part }: Props) {
  let purchases: PurchaseType[] = [];
  let priceData: PriceDataType[] = [];
  let notPurchased: string[] = [];

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
              projection: { name: 1, description: 1, price: 1, concern: 1, part: 1, stats: 1 },
            }
          )
          .toArray() as unknown as PriceDataType[]
    );

    if (!userId) {
      notPurchased = priceData.map((obj) => `${obj.part}-${obj.concern}`);
      return { purchases, priceData, notPurchased };
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

    return { purchases, priceData, notPurchased };
  } catch (err) {
    throw httpError(err);
  }
}
