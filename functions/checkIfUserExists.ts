import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  email: string;
  auth: string;
};

async function checkIfUserExists({ email, auth }: Props) {
  try {
    const result = await doWithRetries(
      async () =>
        await db
          .collection("User")
          .findOne({ email, auth }, { projection: { _id: 1, password: 1 } })
    );

    const { _id: userId } = result || {};

    return {
      userId,
    };
  } catch (err) {
    throw httpError(err);
  }
}

export default checkIfUserExists;
