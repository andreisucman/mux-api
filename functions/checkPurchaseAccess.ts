import * as dotenv from "dotenv";
dotenv.config();

import httpError from "helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  targetUserId: string;
  userId: string;
  parts: string[];
  concerns: string[];
};

export default async function checkPurchaseAccess({ targetUserId, userId, parts = [], concerns = [] }: Props) {
  try {
    if (String(targetUserId) === String(userId)) return { parts, concerns };

    const purchases = await doWithRetries(() =>
      db
        .collection("Purchase")
        .find(
          {
            buyerId: new ObjectId(userId),
            sellerId: new ObjectId(targetUserId),
            part: { $in: parts },
            concern: { $in: concerns },
          },
          { projection: { part: 1, concern: 1, _id: 0 } }
        )
        .toArray()
    );

    return { parts: purchases.map((obj) => obj.part), concerns: purchases.map((obj) => obj.concern) };
  } catch (error) {
    throw httpError(error);
  }
}
