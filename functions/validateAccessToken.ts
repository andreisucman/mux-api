import crypto from "crypto";
import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";

export default async function validateToken(accessToken: string) {
  try {
    const hashedAccessToken = crypto
      .createHash("sha256")
      .update(accessToken)
      .digest("hex");

    const userInfo = await doWithRetries(
      async () =>
        await db.collection("TemporaryAccessToken").findOne(
          { token: hashedAccessToken },
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
    throw err;
  }
}
