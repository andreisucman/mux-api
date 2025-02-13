import { db } from "init.js";
import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";

type Props = {
  operationKey: string;
  value: number;
  userId: string;
  operation?: "set" | "increment";
};

const incrementProgress = async ({
  operationKey,
  value,
  operation = "increment",
  userId,
}: Props) => {
  let payload = {};

  if (operation === "increment") {
    payload = { $inc: { progress: value } };
  }

  if (operation === "set") {
    payload = { $set: { progress: value } };
  }

  doWithRetries(async () =>
    db
      .collection("AnalysisStatus")
      .updateOne({ userId: new ObjectId(userId), operationKey }, payload)
  );
};

export default incrementProgress;
