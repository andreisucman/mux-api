import "dotenv/config";
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
  try {
    let twinDocuments: any[] = [];

    if (embedding) {
      const closestDocuments = await findEmbeddings({
        collection: "TwinRegistry",
        embedding,
        index: "twin_registry_search_vector",
        limit: 3,
        relatednessScore: 50,
        filters: { category },
        projection: { image: 1 },
      });

      const collageImage = await createImageCollage({
        images: [image, ...closestDocuments.map((doc) => doc.image)],
      });

      const twinIndexes = await checkPeopleSimilarity({
        categoryName,
        image: collageImage,
        userId,
      });

      twinDocuments = closestDocuments.filter(
        (doc, i, arr) => i > 0 && twinIndexes.includes(i)
      );
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

    if (userId) {
      if (!twinIds.includes(String(userId))) {
        const insertPayload: { [key: string]: any } = {
          userId: new ObjectId(userId),
          category,
          createdAt: new Date(),
        };

        if (image) insertPayload.image = image;
        if (embedding) insertPayload.embedding = embedding;
        if (ipFingerprint) insertPayload.ipFingerprint = ipFingerprint;

        doWithRetries(async () =>
          db.collection("TwinRegistry").insertOne(insertPayload)
        );
      }
    }

    return twinIds;
  } catch (err) {
    throw httpError(err);
  }
}
