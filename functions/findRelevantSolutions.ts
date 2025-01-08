import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

export default async function findRelevantSolutions(embedding: number[]) {
  try {
    const pipeline = [
      {
        $vectorSearch: {
          index: "solution_search",
          path: "embedding",
          queryVector: embedding,
          numCandidates: 150,
          limit: 1,
          distanceMetric: "cosine",
        },
      },
      {
        $project: {
          productTypes: 1,
          icon: 1,
          suggestions: 1,
        },
      },
    ];

    const closestDocuments = await doWithRetries(async () =>
      db.collection("Solution").aggregate(pipeline).toArray()
    );

    return closestDocuments;
  } catch (err) {
    throw httpError(err);
  }
}
