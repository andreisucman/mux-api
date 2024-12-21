import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

export type CheckImageSimilarityProps = {
  userId?: string;
  hash: string;
  embedding: number[];
  vectorIndexName: "food_image_search" | "style_image_search";
  collection: "FoodAnalysis" | "StyleAnalysis";
};

export default async function checkImageSimilarity({
  userId,
  hash,
  embedding,
  collection,
  vectorIndexName,
}: CheckImageSimilarityProps) {
  const projection = { _id: 1, embedding: 0, hash: 0 };

  try {
    const duplicateCheckResult = await doWithRetries(async () =>
      db.collection(collection).findOne({ hash }, { projection })
    );

    if (duplicateCheckResult) {
      return { status: false, record: duplicateCheckResult };
    }

    const pipeline = [
      {
        $vectorSearch: {
          index: vectorIndexName,
          path: "embedding",
          queryVector: embedding,
          numCandidates: 150,
          limit: 1,
          distanceMetric: "cosine",
          filter: { userId: new ObjectId(userId) },
        },
      },
      {
        $addFields: {
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const closestDocument = await doWithRetries(async () =>
      db.collection(collection).aggregate(pipeline).next()
    );

    if (closestDocument) {
      if (closestDocument.score >= 90) {
        return { status: false, record: closestDocument };
      }
    }

    return { status: true };
  } catch (err) {
    throw httpError(err);
  }
}
