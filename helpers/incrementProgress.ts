import { db } from "init.js";
import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";

type Props = {
  operationKey: string;
  increment: number;
  userId: string;
};

const incrementProgress = async ({ operationKey, increment, userId }: Props) =>
  doWithRetries(async () =>
    db
      .collection("AnalysisStatus")
      .updateOne(
        { userId: new ObjectId(userId), operationKey },
        { $inc: { progress: increment } }
      )
  );

export default incrementProgress;
