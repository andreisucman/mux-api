import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb, db } from "@/init.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";
import { CategoryNameEnum } from "@/types.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  functionName: string;
  categoryName: CategoryNameEnum;
  modelName: string;
  units: number;
  unitCost: number;
};

export default async function updateSpend({
  userId,
  functionName,
  categoryName,
  modelName,
  units,
  unitCost,
}: Props) {
  const createdAt = setUtcMidnight({ date: new Date() });

  const totalCost = units * unitCost;

  const incrementPayload = {
    "overview.accounting.totalCost": totalCost,
    "accounting.totalCost": totalCost,
    "accounting.totalUnits": units,
    [`accounting.units.functions.${functionName}`]: units,
    [`accounting.cost.functions.${functionName}`]: totalCost,
    [`accounting.units.models.${modelName}`]: units,
    [`accounting.cost.models.${modelName}`]: totalCost,
    [`accounting.units.categories.${categoryName}`]: units,
    [`accounting.cost.categories.${categoryName}`]: totalCost,
  };

  try {
    await doWithRetries(async () =>
      adminDb.collection("UserAnalytics").updateOne(
        { userId: new ObjectId(userId), createdAt },
        {
          $inc: incrementPayload,
        },
        {
          upsert: true,
        }
      )
    );

    await doWithRetries(async () =>
      adminDb.collection("TotalAnalytics").updateOne(
        { createdAt },
        {
          $inc: incrementPayload,
        },
        {
          upsert: true,
        }
      )
    );

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        { _id: new ObjectId(userId) },
        {
          $inc: { netBenefit: totalCost * -1 },
        }
      )
    );
  } catch (err) {
    throw httpError(err);
  }
}
