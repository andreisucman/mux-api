import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";
import setUtcMidnight from "@/helpers/setUtcMidnight.js";

export default async function updateAnalytics(incrementPayload: {
  [key: string]: number;
}) {
  const createdAt = setUtcMidnight({ date: new Date() });

  try {
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
