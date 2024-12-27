import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";

type Props = {
  userId: string;
  incrementPayload: { [key: string]: number };
};

export default async function updateAnalytics({
  userId,
  incrementPayload,
}: Props) {
  const today = new Date().toDateString();

  try {
    await doWithRetries(async () =>
      adminDb.collection("UserAnalytics").updateOne(
        { userId: new ObjectId(userId), createdAt: today },
        {
          $inc: {
            ...incrementPayload,
          },
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
          $inc: {
            ...incrementPayload,
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
