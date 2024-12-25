import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  value: number;
};

export default async function updateRevenue({ userId, value }: Props) {
  const today = new Date().toDateString();

  try {
    await doWithRetries(async () =>
      adminDb.collection("UserStats").updateOne(
        { userId: new ObjectId(userId), createdAt: today },
        {
          $inc: {
            totalRevenue: value,
          },
        },
        {
          upsert: true,
        }
      )
    );

    await doWithRetries(async () =>
      adminDb.collection("TotalStats").updateOne(
        { createdAt: today },
        {
          $inc: {
            totalRevenue: value,
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
