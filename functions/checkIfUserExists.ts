import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { ObjectId } from "mongodb";

type Props = {
  email: string;
  auth: string;
};

async function checkIfUserExists({ email, auth }: Props) {
  try {
    const result = (await doWithRetries(
      async () =>
        await db
          .collection("User")
          .findOne({ email, auth }, { projection: { _id: 1, password: 1 } })
    )) as unknown as { _id: ObjectId; password: string | null };

    const { _id: userId, password } = result || {};

    return {
      userId,
      password,
    };
  } catch (err) {
    throw httpError(err);
  }
}

export default checkIfUserExists;
