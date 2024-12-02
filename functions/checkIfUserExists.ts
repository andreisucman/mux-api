import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

type Props = {
  email: string;
  auth: string;
};

async function checkIfUserExists({ email, auth }: Props) {
  try {
    const result = await doWithRetries({
      functionName: "checkIfUserExists",
      functionToExecute: async () =>
        await db
          .collection("User")
          .findOne({ email, auth }, { projection: { _id: 1, password: 1 } }),
    });

    return {
      userId: result?._id,
    };
  } catch (error) {
    addErrorLog({
      functionName: "checkIfUserExists",
      message: error.message,
    });
    throw error;
  }
}

export default checkIfUserExists;
