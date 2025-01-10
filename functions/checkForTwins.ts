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
  registryFilter?: { [key: string]: any };
  categoryName: CategoryNameEnum;
};

export default async function checkForTwins({
  userId,
  image,
  registryFilter = {},
  embedding,
  ipFingerprint,
  categoryName,
}: Props) {
  try {
    let twinDocuments: any[] = [];

    if (embedding) {
      const embeddingFilter: { [key: string]: any } = {
        ...registryFilter,
      };
      if (userId) embeddingFilter.userId = { $ne: new ObjectId(userId) };

      const closestDocuments = await findEmbeddings({
        collection: "TwinRegistry",
        embedding,
        index: "twin_registry_search_vector",
        limit: 3,
        relatednessScore: 0.5,
        filters: embeddingFilter,
        projection: { image: 1 },
      });

      if (closestDocuments.length > 0) {
        const collageImage = await createImageCollage({
          images: [image, ...closestDocuments.map((doc) => doc.image)],
        });

        const twinIndexes = await checkPeopleSimilarity({
          categoryName,
          image: collageImage,
          userId,
        });

        const filteredTwinIndexes = twinIndexes.filter(
          (index) => index !== "0"
        );

        twinDocuments = closestDocuments.filter((doc, index) =>
          filteredTwinIndexes.includes(String(index + 1))
        );
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

    const twinIds = twinDocuments.map((doc) => String(doc._id));

    if (twinIds.length === 0) {
      const updatePayload: { [key: string]: any } = {};

      if (image) updatePayload.image = image;
      if (embedding) updatePayload.embedding = embedding;
      if (ipFingerprint) updatePayload.ipFingerprint = ipFingerprint;

      doWithRetries(async () =>
        db
          .collection("TwinRegistry")
          .updateOne(
            { ...registryFilter, userId: new ObjectId(userId) },
            { $set: updatePayload },
            { upsert: true }
          )
      );
    }

    return twinIds;
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
