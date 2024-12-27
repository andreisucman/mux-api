import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";
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
  const today = new Date().toDateString();

  const incrementPayload = {
    "dashboard.accounting.totalCost": units * unitCost,
    "accounting.totalCost": units * unitCost,
    "accounting.totalUnits": units,
    [`accounting.units.functions.${functionName}`]: units,
    [`accounting.cost.functions.${functionName}`]: units * unitCost,
    [`accounting.units.models.${modelName}`]: units,
    [`accounting.cost.models.${modelName}`]: units * unitCost,
    [`accounting.units.categories.${categoryName}`]: units,
    [`accounting.cost.categories.${categoryName}`]: units * unitCost,
  };

  try {
    await doWithRetries(async () =>
      adminDb.collection("UserAnalytics").updateOne(
        { userId: new ObjectId(userId), createdAt: today },
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
        { createdAt: today },
        {
          $inc: incrementPayload,
        },
        {
          upsert: true,
        }
      )
    );
  } catch (err) {
    throw httpError(err);
  }
}
