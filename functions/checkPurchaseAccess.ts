import * as dotenv from "dotenv";
dotenv.config();

import { PartEnum } from "types.js";
import httpError from "helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  targetUserId: string;
  userId: string;
  parts: string[];
};

export default async function checkPurchaseAccess({
  targetUserId,
  userId,
  parts,
}: Props) {
  try {
    if (String(targetUserId) === String(userId)) return parts;

    const purchases = await doWithRetries(() =>
      db
        .collection("Purchase")
        .find({
          buyerId: new ObjectId(userId),
          sellerId: new ObjectId(targetUserId),
          part: { $in: parts },
        })
        .toArray()
    );

    return purchases.map((obj) => obj.part);
  } catch (error) {
    throw httpError(error);
  }
}
