import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
};

export default async function getStyleCompareRecord({ userId }: Props) {
  try {
    const highestVotedStyleRecord = await doWithRetries({
      functionName: "getStyleCompareRecord",
      functionToExecute: async () =>
        db
          .collection("StyleAnalysis")
          .find({ userId: new ObjectId(userId) })
          .sort({ votes: -1, createdAt: -1 })
          .limit(1)
          .project({
            mainUrl: 1,
            urls: 1,
            styleName: 1,
            analysis: 1,
            createdAt: 1,
          })
          .next(),
    });

    return highestVotedStyleRecord;
  } catch (err) {
    throw httpError(err);
  }
}
