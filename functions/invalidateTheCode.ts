import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";

export default async function invalidateTheCode(code: string) {
  try {
    if (!code) throw httpError("Missing the code");

    await doWithRetries(
      async () =>
        await db
          .collection("TemporaryAccessToken")
          .updateOne({ code }, { $set: { expiresOn: new Date(0) } })
    );
  } catch (err) {
    throw err;
  }
}
