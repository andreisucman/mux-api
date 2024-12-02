import { db } from "init.js";
import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";

type Props = {
  type: string;
  increment: number;
  userId: string;
};

const statusIncrementCallback = async ({ type, increment, userId }: Props) =>
  doWithRetries({
    functionName: "uploadProgress - increment analysis status",
    functionToExecute: async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), type },
          { $inc: { progress: increment } }
        ),
  });

export default statusIncrementCallback;
