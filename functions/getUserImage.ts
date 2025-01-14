import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ProgressImageType } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";

export default async function getUsersImage(userId: string) {
  try {
    const latestHeadProgressRecord = await doWithRetries(async () =>
      db
        .collection("Progress")
        .find(
          { userId: new ObjectId(userId), type: "head" },
          { projection: { images: 1 } }
        )
        .sort({ createdAt: -1 })
        .next()
    );

    if (!latestHeadProgressRecord) return null;

    const { images } = latestHeadProgressRecord;

    const frontalImage = images.find(
      (o: ProgressImageType) => o.position === "front"
    );

    return frontalImage.mainUrl.url;
  } catch (err) {
    throw httpError(err);
  }
}
