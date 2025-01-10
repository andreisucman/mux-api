import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

export default async function validateCode(code: string) {
  try {
    const userInfo = await doWithRetries(
      async () =>
        await db.collection("TemporaryAccessToken").findOne(
          { code },
          {
            projection: {
              expiresOn: 1,
              userId: 1,
            },
          }
        )
    );

    if (!userInfo)
      return {
        status: false,
        userId: null as ObjectId | null,
        type: "invalid",
      };

    const { expiresOn, userId } = userInfo;

    const expired = new Date(expiresOn) < new Date();

    if (expired)
      return {
        status: false,
        userId: null as ObjectId | null,
        type: "expired",
      };

    return {
      status: true,
      userId,
    };
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
