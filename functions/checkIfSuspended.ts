import * as dotenv from "dotenv";
dotenv.config();

import httpError from "@/helpers/httpError.js";
import findEmbeddings from "./findEmbeddings.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import checkPeopleSimilarity from "./checkPeopleSimilarity.js";
import createImageCollage from "./createImageCollage.js";
import { CategoryNameEnum } from "@/types.js";
import { db } from "@/init.js";

type Props = {
  userId?: string;
  image?: string;
  ipFingerprint?: string;
  embedding?: number[];
  categoryName: CategoryNameEnum;
};

export default async function checkIfSuspended({
  embedding,
  ipFingerprint,
  categoryName,
  userId,
  image,
}: Props) {
  try {
    let suspendedDocuments: any[] = [];

    if (embedding) {
      const closestDocuments = await findEmbeddings({
        collection: "SuspendedUser",
        embedding,
        index: "suspended_user_search_vector",
        limit: 3,
        relatednessScore: 0.5,
        projection: { image: 1 },
      });

      if (closestDocuments.length > 0) {
        const collageImage = await createImageCollage({
          images: [image, ...closestDocuments.map((doc) => doc.image)],
        });

        const suspendedIndexes = await checkPeopleSimilarity({
          categoryName,
          image: collageImage,
          userId,
        });

        const filteredTwinIndexes = suspendedIndexes.filter(
          (index) => index !== "0"
        );

        suspendedDocuments = closestDocuments.filter((doc, index) =>
          filteredTwinIndexes.includes(String(index + 1))
        );
      }
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
    throw httpError(err.message, err.status);
  }
}
