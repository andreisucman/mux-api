import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  functionName: string;
  modelName: string;
  units: number;
  unitCost: number;
};

export default async function updateSpend({
  userId,
  functionName,
  modelName,
  units,
  unitCost,
}: Props) {
  const today = new Date().toDateString();

  try {
    await doWithRetries(async () =>
      adminDb.collection("UserSpend").updateOne(
        { userId: new ObjectId(userId), createdAt: today },
        {
          $inc: {
            [`units.function.${functionName}`]: units,
            [`cost.function.${functionName}`]: units * unitCost,
            [`unitCost.function.${functionName}`]: unitCost,
          },
        },
        {
          upsert: true,
        }
      )
    );

    await doWithRetries(async () =>
      adminDb.collection("TotalSpend").updateOne(
        { createdAt: today },
        {
          $inc: {
            [`units.function.${functionName}`]: units,
            [`cost.function.${functionName}`]: units * unitCost,
            [`unitCost.function.${functionName}`]: unitCost,
            [`units.model.${modelName}`]: units,
            [`cost.model.${modelName}`]: units * unitCost,
            [`unitCost.model.${modelName}`]: unitCost,
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
