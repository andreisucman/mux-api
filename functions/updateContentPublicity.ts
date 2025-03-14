import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  collection: string;
  part: string;
  isPublic: boolean;
};

export default async function updateContentPublicity({
  userId,
  collection,
  part,
  isPublic,
}: Props) {
  try {
    await doWithRetries(async () =>
      db
        .collection(collection)
        .updateMany(
          { userId: new ObjectId(userId), part },
          { $set: { isPublic } }
        )
    );
  } catch (err) {
    throw httpError(err);
  }
}
