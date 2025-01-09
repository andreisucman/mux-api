import checkForTwins from "./checkForTwins.js";
import createFaceEmbedding from "./createFaceEmbedding.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";
import generateIpAndNumberFingerprint from "./generateIpAndNumberFingerprint.js";

type Props = {
  requestUserId?: string;
  payloadUserId: string;
  image?: string;
  fingerprint?: number;
  ip?: string;
  category: "style" | "progress" | "food";
};

export default async function checkAndRecordTwin({
  requestUserId,
  payloadUserId,
  fingerprint,
  category,
  image,
  ip,
}: Props) {
  let mustLogin = false;

  try {
    let embedding;
    let ipFingerprint;

    if (image) {
      embedding = await createFaceEmbedding(image);
    }
    if (fingerprint && ip) {
      ipFingerprint = generateIpAndNumberFingerprint(ip, fingerprint);
    }

    const twinIds = await checkForTwins({
      userId: requestUserId || payloadUserId,
      category,
      embedding,
      ipFingerprint,
      image,
    });

    if (twinIds.length > 0) {
      if (requestUserId) {
        // add a twin record if logged in and twin exists
        doWithRetries(async () =>
          db
            .collection("User")
            .updateOne({ _id: new ObjectId(requestUserId) }, {
              $addToSet: { twinIds: requestUserId },
            } as any)
        );
      } else {
        mustLogin = true; // prompt to login if not logged in and twin exists
      }
    }
  } catch (err) {
    throw httpError(err);
  } finally {
    return mustLogin;
  }
}
