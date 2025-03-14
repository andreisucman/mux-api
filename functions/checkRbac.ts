import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

type Props = {
  userId: string;
  sellerId: ObjectId;
  part?: string;
};

export default async function checkRbac({ part, userId, sellerId }: Props) {
  try {
    const filter: { [key: string]: any } = {
      buyerId: new ObjectId(userId),
      sellerId: new ObjectId(sellerId),
    };

    if (part) filter.part = part;

    const result = await doWithRetries(async () =>
      db
        .collection("Purchase")
        .find(filter, {
          projection: {
            isSubscribed: 1,
            contentEndDate: 1,
            part: 1,
          },
        })
        .toArray()
    );

    return result;
  } catch (err) {
    throw httpError(err);
  }
}
