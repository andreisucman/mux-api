import checkRbac from "./checkRbac.js";
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

    const { priceData, purchases, notPurchased } = await checkRbac({
      userId,
      sellerId,
      part,
    });

    let data = [];

    if (purchases.length) {
      let filtered = [];

      for (const obj of purchases) {
        const { contentEndDate, part: purchasedPart } = obj;

        const filteredArray = array.filter((obj: any) => {
          const createdWithinSubscriptionPeriod =
            new Date(obj[dateKey]) <= new Date(contentEndDate);

          const conditionOne =
            createdWithinSubscriptionPeriod && obj.part === purchasedPart;

          return conditionOne;
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
      }
    }

    return {
      priceData,
      data,
      notPurchased: notPurchased.map((obj) => obj.part),
    };
  } catch (err) {
    throw httpError(err);
  }
}
