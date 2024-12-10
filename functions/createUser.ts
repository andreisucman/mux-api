import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { defaultUser } from "data/defaultUser.js";
import { UserType } from "types.js";
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

    const newUser = await doWithRetries(
      async () =>
        await db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(userId) },
            { $set: updatePayload },
            { upsert: true }
          )
    );

    return { ...updatePayload, _id: userId };
  } catch (err) {
    throw httpError(err);
  }
}

export default createUser;
