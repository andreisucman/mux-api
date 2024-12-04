import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "helpers/httpError.js";

type Props = {
  userId: string;
  updatePayload: { [key: string]: any };
};

export default async function updatePublicContent({
  userId,
  updatePayload,
}: Props) {
  try {
    await doWithRetries(async () =>
      db
        .collection("Proof")
        .updateMany({ userId: new ObjectId(userId) }, { $set: updatePayload })
    );

    await doWithRetries(async () =>
      db
        .collection("Progress")
        .updateMany({ userId: new ObjectId(userId) }, { $set: updatePayload })
    );

    await doWithRetries(async () =>
      db
        .collection("BeforeAfter")
        .updateMany({ userId: new ObjectId(userId) }, { $set: updatePayload })
    );

    await doWithRetries(async () =>
      db
        .collection("StyleAnalysis")
        .updateMany({ userId: new ObjectId(userId) }, { $set: updatePayload })
    );
  } catch (err) {
    throw httpError(err);
  }
}
