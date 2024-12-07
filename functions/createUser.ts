import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { defaultUser } from "data/defaultUser.js";
import { UserType } from "types.js";
import httpError from "@/helpers/httpError.js";

async function createUser(props: Partial<UserType>) {
  const { _id: userId, ...otherProps } = props || {};

  try {
    const payload = {
      ...defaultUser,
      _id: new ObjectId(userId),
      ...otherProps,
    };

    const newUser = await doWithRetries(
      async () => await db.collection("User").insertOne(payload)
    );

    return { ...payload, _id: newUser.insertedId };
  } catch (err) {
    throw httpError(err);
  }
}

export default createUser;
