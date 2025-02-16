import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";
import { setToUtcMidnight } from "@/helpers/utils.js";
import { ObjectId } from "mongodb";

type UpdateAnalyticsProps = {
  userId?: string;
  incrementPayload: {
    [key: string]: number;
  };
};

export default async function updateAnalytics({
  userId,
  incrementPayload,
}: UpdateAnalyticsProps) {
  const createdAt = setToUtcMidnight(new Date());

  try {
    if (userId) {
      await doWithRetries(async () =>
        adminDb.collection("UserAnalytics").updateOne(
          { createdAt, userId: new ObjectId(userId) },
          {
            $inc: incrementPayload,
          },
          {
            upsert: true,
          }
        )
      );
    }

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
  } catch (err) {
    throw httpError(err);
  }
}
