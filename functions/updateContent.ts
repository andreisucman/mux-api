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

      let update = {};

      if (collection !== "BeforeAfter") {
        const { avatar, ...rest } = updatePayload;
        update = { ...rest };
      } else {
        update = updatePayload;
      }

      await doWithRetries(async () =>
        db.collection(collection).updateMany(filter, { $set: update })
      );
    }
  } catch (err) {
    throw httpError(err);
  }
}
