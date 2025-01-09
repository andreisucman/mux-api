import checkForTwins from "./checkForTwins.js";
import createHumanEmbedding from "./createHumanEmbedding.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";
import generateIpAndNumberFingerprint from "./generateIpAndNumberFingerprint.js";
import checkIfSuspended from "./checkIfSuspended.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  requestUserId?: string;
  payloadUserId: string;
  image?: string;
  fingerprint?: number;
  ip?: string;
  category: "style" | "progress" | "food";
  categoryName: CategoryNameEnum;
};

export default async function checkAndRecordTwin({
  requestUserId,
  payloadUserId,
  categoryName,
  fingerprint,
  category,
  image,
  ip,
}: Props) {
  let mustLogin = false;
  let isSuspended = false;

  try {
    let embedding;
    let ipFingerprint;

    if (image) {
      embedding = await createHumanEmbedding(image);
    }
    if (fingerprint && ip) {
      ipFingerprint = generateIpAndNumberFingerprint(ip, fingerprint);
    }

    isSuspended = await checkIfSuspended({
      embedding,
      ipFingerprint,
      category,
      categoryName,
    });

    const twinIds = await checkForTwins({
      userId: requestUserId || payloadUserId,
      category,
      embedding,
      ipFingerprint,
      image,
      categoryName,
    });

    if (twinIds.length > 0) {
      if (requestUserId) {
        // add a twin record if logged in and twin exists
        doWithRetries(async () =>
          db
            .collection("User")
            .updateOne({ _id: new ObjectId(requestUserId) }, {
              $addToSet: { twinIds: requestUserId },
              $inc: { twinCount: 1 },
            } as any)
        );
      } else {
        mustLogin = true; // prompt to login if not logged in and twin exists
      }
    }
  } catch (err) {
    throw httpError(err);
  } finally {
    return { mustLogin, isSuspended };
  }
}
