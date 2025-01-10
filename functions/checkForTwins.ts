import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";

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

export default async function checkForTwins({
  userId,
  image,
  embedding,
  ipFingerprint,
  category,
  categoryName,
}: Props) {
  console.log("checkForTwins", {
    userId,
    image,
    embedding,
    ipFingerprint,
    category,
    categoryName,
  });
  try {
    let twinDocuments: any[] = [];

    if (embedding) {
      console.log("checkForTwins line 41");
      const embeddingFilter: { [key: string]: any } = { category };
      if (userId) embeddingFilter.userId = { $ne: new ObjectId(userId) };

      const closestDocuments = await findEmbeddings({
        collection: "TwinRegistry",
        embedding,
        index: "twin_registry_search_vector",
        limit: 3,
        relatednessScore: 50,
        filters: embeddingFilter,
        projection: { image: 1 },
      });

      console.log("checkForTwins line 55", closestDocuments);

      if (closestDocuments.length > 0) {
        const collageImage = await createImageCollage({
          images: [image, ...closestDocuments.map((doc) => doc.image)],
        });

        console.log("checkForTwins line 61", collageImage);
        const twinIndexes = await checkPeopleSimilarity({
          categoryName,
          image: collageImage,
          userId,
        });

        console.log("checkForTwins lin 68 twinIndexes", twinIndexes);

        twinDocuments = closestDocuments.filter(
          (doc, i, arr) => i > 0 && twinIndexes.includes(String(i))
        );

        console.log("checkForTwins line 74 twinDocuments", twinDocuments);
      }
    } else {
      twinDocuments = await doWithRetries(async () =>
        db
          .collection("TwinRegistry")
          .find({ ipFingerprint })
          .project({ userId: 1 })
          .toArray()
      );
    }

    const twinIds = twinDocuments.map((doc) => String(doc.userId));

    console.log("checkForTwins line 87 twinIds", twinIds);

    if (twinIds.length === 0) {
      const updatePayload: { [key: string]: any } = {};

      if (image) updatePayload.image = image;
      if (embedding) updatePayload.embedding = embedding;
      if (ipFingerprint) updatePayload.ipFingerprint = ipFingerprint;

      console.log("checkForTwins line 96 updatePayload", updatePayload);

      doWithRetries(async () =>
        db
          .collection("TwinRegistry")
          .updateOne(
            { userId: new ObjectId(userId), category },
            { $set: updatePayload },
            { upsert: true }
          )
      );
    }

    return twinIds;
  } catch (err) {
    throw httpError(err);
  }
}
