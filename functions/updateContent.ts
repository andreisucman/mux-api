import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "helpers/httpError.js";

type Props = {
  updatePayload: { [key: string]: any };
  collections: string[];
  filter: { [key: string]: any };
};

export default async function updateContent({ updatePayload, collections, filter }: Props) {
  try {
    for (const collection of collections) {
      let update = {};

      if (collection !== "BeforeAfter") {
        const { avatar, ...rest } = updatePayload;
        update = { ...rest };
      } else {
        update = updatePayload;
      }

      await doWithRetries(async () => db.collection(collection).updateMany(filter, { $set: update }));
    }
  } catch (err) {
    throw httpError(err);
  }
}
