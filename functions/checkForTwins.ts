import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import httpError from "@/helpers/httpError.js";
import findEmbeddings from "./findEmbeddings.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import checkPeopleSimilarity from "./checkPeopleSimilarity.js";
import { CategoryNameEnum, ProgressType } from "@/types.js";
import createImageCollage from "./createImageCollage.js";
import { db } from "@/init.js";

type Props = {
  requestUserId?: string;
  finalUserId: string;
  image?: string;
  embedding?: number[];
  registryFilter?: { [key: string]: any };
  categoryName: CategoryNameEnum;
};

export default async function checkForTwins({
  requestUserId,
  finalUserId,
  image,
  registryFilter = {},
  embedding,
  categoryName,
}: Props) {
  try {
    let twinDocuments: any[] = [];

    if (embedding) {
      const embeddingFilter: { [key: string]: any } = {
        ...registryFilter,
      };
      if (requestUserId)
        // this is done to avoid matching with the current user if the user is logged in
        embeddingFilter.userId = { $ne: new ObjectId(requestUserId) };

      const closestDocuments = await findEmbeddings({
        collection: "TwinRegistry",
        embedding,
        index: "twin_registry_search_vector",
        limit: 2,
        relatednessScore: 0,
        filters: embeddingFilter,
        projection: { image: 1, userId: 1 },
      });

      if (closestDocuments.length > 0) {
        const inIds = [new ObjectId(finalUserId), ...closestDocuments.map((doc) => new ObjectId(doc.userId))];

        const progressOfTwins = (await doWithRetries(async () =>
          db
            .collection("Progress")
            .find({
              userId: {
                $in: inIds,
              },
            })
            .sort({ createdAt: -1 })
            .project({ "images.urls": 1, userId: 1 })
            .toArray()
        )) as unknown as ProgressType[];

        const originalImages = progressOfTwins
          .map((rec) => {
            const originalUrlObj = rec.images
              .flatMap((imo) => imo.urls)
              .find((io: { name: string; url: string }) => io.name === "original");
            if (!originalUrlObj) return null;

            return originalUrlObj.url;
          })
          .filter(Boolean);

        const uniqueOriginalImages = [...new Set(originalImages)];

        if (originalImages.length) {
          const collageImage = await createImageCollage({
            images: uniqueOriginalImages,
            isGrid: true,
          });

          const twinIndexes = await checkPeopleSimilarity({
            categoryName,
            image: collageImage,
            userId: finalUserId,
          });

          const filteredTwinIndexes = twinIndexes.filter((index) => index !== "0");

          twinDocuments = closestDocuments.filter((doc, index) => filteredTwinIndexes.includes(String(index + 1)));
        }
      }
    }

    const twinIds = twinDocuments.map((doc) => String(doc._id));

    if (twinIds.length === 0) {
      const updatePayload: { [key: string]: any } = {};

      if (image) updatePayload.image = image;
      if (embedding) updatePayload.embedding = embedding;

      doWithRetries(async () =>
        db
          .collection("TwinRegistry")
          .updateOne(
            { ...registryFilter, userId: new ObjectId(finalUserId) },
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
