import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "helpers/httpError.js";

type Props = {
  userId: string;
  updatePayload: { [key: string]: any };
  collections: string[];
  part?: string;
};

export default async function updateContent({
  userId,
  updatePayload,
  collections,
  part,
}: Props) {
  try {
    for (const collection of collections) {
      const filter: { [key: string]: any } = { userId: new ObjectId(userId) };
      if (part) filter.part = part;

      if (["Proof", "Progres", "Diary", "Routine"].includes(collection)) {
        delete updatePayload.avatar;
      }

      await doWithRetries(async () =>
        db.collection(collection).updateMany(filter, { $set: updatePayload })
      );
    }
  } catch (err) {
    throw httpError(err);
  }
}
