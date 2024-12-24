import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  functionName: string;
  categoryName: string;
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

  try {
    await doWithRetries(async () =>
      adminDb.collection("UserCost").updateOne(
        { userId: new ObjectId(userId), createdAt: today },
        {
          $inc: {
            [`units.functions.${functionName}`]: units,
            [`cost.functions.${functionName}`]: units * unitCost,
            [`unitCost.functions.${functionName}`]: unitCost,
            [`units.models.${modelName}`]: units,
            [`cost.models.${modelName}`]: units * unitCost,
            [`unitCost.models.${modelName}`]: unitCost,
            [`units.categories.${categoryName}`]: units,
            [`cost.categories.${categoryName}`]: units * unitCost,
            [`unitCost.categories.${categoryName}`]: unitCost,
          },
        },
        {
          upsert: true,
        }
      )
    );

    await doWithRetries(async () =>
      adminDb.collection("TotalCost").updateOne(
        { createdAt: today },
        {
          $inc: {
            [`units.functions.${functionName}`]: units,
            [`cost.functions.${functionName}`]: units * unitCost,
            [`unitCost.functions.${functionName}`]: unitCost,
            [`units.models.${modelName}`]: units,
            [`cost.models.${modelName}`]: units * unitCost,
            [`unitCost.models.${modelName}`]: unitCost,
            [`units.categories.${categoryName}`]: units,
            [`cost.categories.${categoryName}`]: units * unitCost,
            [`unitCost.categories.${categoryName}`]: unitCost,
          },
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
