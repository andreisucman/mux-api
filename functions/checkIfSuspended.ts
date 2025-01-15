import * as dotenv from "dotenv";
dotenv.config();

import httpError from "@/helpers/httpError.js";
import findEmbeddings from "./findEmbeddings.js";
import checkPeopleSimilarity from "./checkPeopleSimilarity.js";
import createImageCollage from "./createImageCollage.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  userId?: string;
  image?: string;
  embedding?: number[];
  categoryName: CategoryNameEnum;
};

export default async function checkIfSuspended({
  embedding,
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
          isGrid: false,
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
    }

    return suspendedDocuments.length > 0;
  } catch (err) {
    throw httpError(err);
  }
}
