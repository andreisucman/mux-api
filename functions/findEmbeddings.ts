import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

type FindEmbeddingsProps = {
  embedding: number[];
  filters?: { [key: string]: any };
  projection?: { [key: string]: number };
  index: string;
  limit?: number;
  collection: string;
  relatednessScore?: number;
};

export default async function findEmbeddings({
  index,
  limit = 2,
  filters = {},
  projection,
  embedding,
  collection,
  relatednessScore = 0.7,
}: FindEmbeddingsProps) {
  try {
    const pipeline: { [key: string]: any }[] = [
      {
        $vectorSearch: {
          index,
          limit,
          path: "embedding",
          queryVector: embedding,
          numCandidates: Math.min(limit * 20, 150),
          distanceMetric: "cosine",
          filter: filters,
        },
      },
    ];

    if (projection) {
      pipeline.push({
        $project: { ...projection, score: { $meta: "vectorSearchScore" } },
      });
    }

    const closestDocuments = await doWithRetries(async () =>
      db.collection(collection).aggregate(pipeline).toArray()
    );

    const filtered = closestDocuments.filter(
      (doc) => doc.score > relatednessScore
    );

    return filtered.map((doc) => {
      const { score, ...rest } = doc;
      return rest;
    });
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
