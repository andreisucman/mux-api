import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import { db } from "init.js";

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
  const projection = { embedding: 0, hash: 0 };

  try {
    const duplicateCheckResult = await doWithRetries({
      functionName: "checkImageSimilarity - check",
      functionToExecute: async () =>
        db.collection(collection).findOne({ hash }, { projection }),
    });

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

    const closestDocument = await doWithRetries({
      functionName: "checkImageSimilarity - find",
      functionToExecute: async () =>
        db.collection(collection).aggregate(pipeline).next(),
    });

    if (closestDocument) {
      if (closestDocument.score >= 90) {
        return { status: false, record: closestDocument };
      }
    }

    return { status: true };
  } catch (err) {
    addErrorLog({ functionName: "checkImageSimilarity", message: err.message });
    throw err;
  }
}
