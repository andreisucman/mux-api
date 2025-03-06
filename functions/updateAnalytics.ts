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
  decrementPayload?: {
    [key: string]: number;
  };
};

const updateCollection = async (
  collection: string,
  filter: { [key: string]: any },
  payload: { [key: string]: number }
) =>
  await doWithRetries(async () =>
    adminDb.collection(collection).updateOne(
      filter,
      {
        $inc: payload,
      },
      {
        upsert: true,
      }
    )
  );

export default async function updateAnalytics({
  userId,
  incrementPayload,
  decrementPayload,
}: UpdateAnalyticsProps) {
  const createdAt = setToUtcMidnight(new Date());

  try {
    if (userId) {
      await updateCollection(
        "UserAnalytics",
        { createdAt, userId: new ObjectId(userId) },
        incrementPayload
      );
    }

    await updateCollection("TotalAnalytics", { createdAt }, incrementPayload);

    if (decrementPayload) {
      if (userId) {
        await updateCollection(
          "UserAnalytics",
          { createdAt, userId: new ObjectId(userId) },
          decrementPayload
        );
      }

      await updateCollection("TotalAnalytics", { createdAt }, decrementPayload);
    }
  } catch (err) {
    throw httpError(err);
  }
}
