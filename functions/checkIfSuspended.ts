import "dotenv/config";

import httpError from "@/helpers/httpError.js";
import findEmbeddings from "./findEmbeddings.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import checkPeopleSimilarity from "./checkPeopleSimilarity.js";
import { CategoryNameEnum } from "@/types.js";
import createImageCollage from "./createImageCollage.js";

type Props = {
  userId?: string;
  image?: string;
  ipFingerprint?: string;
  embedding?: number[];
  category: "style" | "progress" | "food";
  categoryName: CategoryNameEnum;
};

export default async function checkIfSuspended({
  embedding,
  ipFingerprint,
  categoryName,
  userId,
}: Props) {
  try {
    let suspendedDocuments: any[] = [];

    if (embedding) {
      const closestDocuments = await findEmbeddings({
        collection: "SuspendedUser",
        embedding,
        index: "suspended_user_search_vector",
        limit: 4,
        relatednessScore: 50,
        projection: { image: 1 },
      });

      const collageImage = await createImageCollage({
        images: closestDocuments.map((doc) => doc.image),
      });

      const suspendedIndexes = await checkPeopleSimilarity({
        categoryName,
        image: collageImage,
        userId,
      });

      suspendedDocuments = closestDocuments.filter(
        (doc, i, arr) => i > 0 && suspendedIndexes.includes(i)
      );
    } else {
      suspendedDocuments = await doWithRetries(async () =>
        db
          .collection("SuspendedUser")
          .find({ ipFingerprint })
          .project({ userId: 1 })
          .toArray()
      );
    }

    return suspendedDocuments.length > 0;
  } catch (err) {
    throw httpError(err);
  }
}
