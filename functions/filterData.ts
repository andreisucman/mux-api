import { ObjectId } from "mongodb";
import checkRbac from "./checkRbac.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";
import setToMidnight from "@/helpers/setToMidnight.js";

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

    console.log("result", result);

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

        const filteredArray = array.filter((obj: any) => {
          const conditionOne =
            new Date(obj[dateKey]) <=
              new Date(subscribedUntil || contentEndDate) &&
            obj.part === purchasedPart;

          console.log("conditionOne", conditionOne);

          const conditionTwo =
            !obj.deletedOn ||
            (new Date(obj.deletedOn) >= new Date(createdAt) &&
              new Date(obj.deletedOn) <=
                new Date(subscribedUntil || contentEndDate));

          console.log("conditionTwo", conditionTwo);
          return conditionOne && conditionTwo;
        });

        filtered.push(...filteredArray);
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
