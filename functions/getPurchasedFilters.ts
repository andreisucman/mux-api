import httpError from "@/helpers/httpError.js";
import getUserInfo from "./getUserInfo.js";
import checkRbac from "./checkRbac.js";

type Props = {
  userName: string;
  userId: string;
  part?: string;
};

export default async function getPurchasedFilters({
  userName,
  userId,
  part,
}: Props) {
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

    const {
      priceData: priceDataList,
      purchases: purchasesList,
      notPurchased: notPurchasedList,
    } = await checkRbac({
      userId,
      sellerId: sellerIdObj._id,
      part,
    });

    purchases = purchasesList;
    priceData = priceDataList;
    notPurchased = notPurchasedList;

    if (purchases.length) {
      const purchasedParts = [];
      const withinPurchasedPeriod: { [key: string]: any } = {};

      for (const obj of purchases) {
        const { contentEndDate, part: purchasedPart } = obj;
        purchasedParts.push(purchasedPart);
        withinPurchasedPeriod.$lte = new Date(contentEndDate);
      }

      additionalFilters.part = { $in: purchasedParts };
      additionalFilters.createdAt = withinPurchasedPeriod;
    } else {
      additionalFilters.isPublic = true;
      additionalFilters.deletedOn = { $exists: false };
    }

    return { purchases, priceData, notPurchased, additionalFilters };
  } catch (err) {
    throw httpError(err);
  }
}
