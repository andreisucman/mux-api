import { ObjectId } from "mongodb";
import { UpdateErrorProps } from "types/addAnalysisStatusErrorTypes.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

export default async function addAnalysisStatusError({
  userId,
  type,
  message,
}: UpdateErrorProps) {
  try {
    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), type },
          { $set: { isRunning: false, isError: true, message } }
        )
    );
  } catch (err) {
    console.log("Error in addAnalysisStatusError: ", err);
  }
}
