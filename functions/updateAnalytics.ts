import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { adminDb } from "@/init.js";

export default async function updateAnalytics(incrementPayload: {
  [key: string]: number;
}) {
  const today = new Date().toDateString();

  try {
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
