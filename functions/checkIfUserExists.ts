import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { UserType } from "@/types.js";

type Props = {
  filter: { [key: string]: any };
  projection?: { [key: string]: number };
};

async function checkIfUserExists({ filter, projection = {} }: Props) {
  try {
    const result = (await doWithRetries(
      async () =>
        await db
          .collection("User")
          .findOne({ ...filter }, { projection: projection })
    )) as unknown as Partial<UserType>;

    return result;
  } catch (err) {
    throw httpError(err);
  }
}

export default checkIfUserExists;
