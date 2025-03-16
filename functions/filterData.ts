import { ObjectId } from "mongodb";
import checkRbac from "./checkRbac.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  array: any[];
  userId: string;
  part: string;
  dateKey: string;
  maskFunction: (args: any) => any;
};

export async function filterData({
  array,
  userId,
  part,
  dateKey,
  maskFunction,
}: Props) {
  try {
    const { userId: sellerId } = array[0] || {};

    const result = await checkRbac({
      userId,
      sellerId,
      part,
    });

    let priceData = null;
    let data = [];

    if (result.length) {
      let filtered = [];

      for (const obj of result) {
        const {
          subscribedUntil,
          createdAt,
          contentEndDate,
          part: purchasedPart,
        } = obj;

        if (!subscribedUntil) {
          filtered.push(
            ...array.filter(
              (obj: any) =>
                new Date(obj[dateKey]) >= new Date(createdAt) &&
                new Date(obj[dateKey]) <= new Date(contentEndDate) &&
                obj.part === purchasedPart
            )
          );
        } else {
          filtered.push(
            ...array.filter(
              (r) =>
                new Date(obj[dateKey]) <= new Date(subscribedUntil) &&
                r.part === purchasedPart
            )
          );
        }

        filtered = filtered.filter(
          (rec) =>
            !rec.deletedOn ||
            (new Date(rec.deletedOn) >= new Date(createdAt) &&
              new Date(rec.deletedOn) <=
                new Date(subscribedUntil || contentEndDate))
        );
      }

      data = filtered;
    } else {
      array = array.filter((o) => o.isPublic && !o.deletedOn);

      if (array.length > 0) {
        if (maskFunction) {
          data = array.map((obj) => maskFunction(obj));
        } else {
          data = array;
        }

        const filter: { [key: string]: any } = {
          userId: new ObjectId(sellerId),
          status: "public",
        };

        priceData = await doWithRetries(async () =>
          db
            .collection("RoutineData")
            .find(filter, {
              projection: { name: 1, description: 1, price: 1, part: 1 },
            })
            .toArray()
        );
      }
    }

    return { priceData, data };
  } catch (err) {
    throw httpError(err);
  }
}
