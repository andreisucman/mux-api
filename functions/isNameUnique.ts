import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ModerationStatusEnum } from "@/types.js";
import { db } from "@/init.js";

export default async function isNameUnique(name: string) {
  let isUnique = false;

  try {
    const record = await doWithRetries(async () =>
      db
        .collection("User")
        .findOne(
          { name, moderationStatus: ModerationStatusEnum.ACTIVE },
          { projection: { _id: 1 } }
        )
    );

    isUnique = !record;
  } catch (err) {
    throw httpError(err.message, err.status);
  } finally {
    return isUnique;
  }
}
