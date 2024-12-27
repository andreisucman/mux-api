import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { defaultUser } from "data/defaultUser.js";
import { ModerationStatusEnum, UserType } from "types.js";
import updateAnalytics from "./updateAnalytics.js";
import httpError from "@/helpers/httpError.js";

async function createUser(props: Partial<UserType>) {
  let { _id: userId, ...otherProps } = props || {};

  try {
    if (!userId) {
      userId = new ObjectId();
    }

    const updatePayload = {
      ...defaultUser,
      ...otherProps,
    };

    await doWithRetries(
      async () =>
        await db
          .collection("User")
          .updateOne(
            {
              _id: new ObjectId(userId),
              moderationStatus: ModerationStatusEnum.ACTIVE,
            },
            { $set: updatePayload },
            { upsert: true }
          )
    );

    updateAnalytics({
      userId: String(userId),
      incrementPayload: { "dashboard.user.totalUsers": 1 },
    });

    return { ...updatePayload, _id: userId };
  } catch (err) {
    throw httpError(err);
  }
}

export default createUser;
