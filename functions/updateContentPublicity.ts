import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  collections: string[];
  part?: string;
  isPublic: boolean;
};

export default async function updateContentPublicity({
  userId,
  collections,
  part,
  isPublic,
}: Props) {
  try {
    for (const collection of collections) {
      const filter: { [key: string]: any } = { userId: new ObjectId(userId) };
      if (part) filter.part = part;

      await doWithRetries(async () =>
        db.collection(collection).updateMany(filter, { $set: { isPublic } })
      );
    }
  } catch (err) {
    throw httpError(err);
  }
}
