import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "helpers/httpError.js";

type Props = {
  userId: string;
  updatePayload: { [key: string]: any };
  collections: string[];
};

export default async function updatePublicContent({
  userId,
  updatePayload,
  collections,
}: Props) {
  try {
    for (const collection of collections) {
      if (["Proof", "Progres", "Diary", "Routine"].includes(collection)) {
        delete updatePayload.avatar;
      }
      await doWithRetries(async () =>
        db
          .collection(collection)
          .updateMany({ userId: new ObjectId(userId) }, { $set: updatePayload })
      );
    }
  } catch (err) {
    throw httpError(err);
  }
}
