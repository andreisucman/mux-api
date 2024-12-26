import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";

type Props = {
  userId: string;
  amount: number;
};

export default async function updateWithdrawn({ userId, amount }: Props) {
  const today = new Date().toDateString();

  try {
    await doWithRetries(async () =>
      adminDb.collection("UserStats").updateOne(
        { userId: new ObjectId(userId), createdAt: today },
        {
          $inc: {
            totalWithdrawn: amount,
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
            totalWithdrawn: amount,
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
