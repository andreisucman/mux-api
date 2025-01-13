import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import httpError from "@/helpers/httpError.js";
import findEmbeddings from "./findEmbeddings.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import checkPeopleSimilarity from "./checkPeopleSimilarity.js";
import { CategoryNameEnum } from "@/types.js";
import createImageCollage from "./createImageCollage.js";
import { db } from "@/init.js";

type Props = {
  userId?: string;
  image?: string;
  embedding?: number[];
  registryFilter?: { [key: string]: any };
  categoryName: CategoryNameEnum;
};

export default async function checkForTwins({
  userId,
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
      if (userId) embeddingFilter.userId = { $ne: new ObjectId(userId) };

      const closestDocuments = await findEmbeddings({
        collection: "TwinRegistry",
        embedding,
        index: "twin_registry_search_vector",
        limit: 2,
        relatednessScore: 0.5,
        filters: embeddingFilter,
        projection: { image: 1, userId: 1 },
      });

      if (closestDocuments.length > 0) {
        const inIds = [
          new ObjectId(userId),
          ...closestDocuments.map((doc) => new ObjectId(doc.userId)),
        ];

        const progressOfTwins = await doWithRetries(async () =>
          db
            .collection("Progress")
            .find({
              userId: {
                $in: inIds,
              },
            })
            .sort({ createdAt: -1 })
            .project({ "images.position": 1, "images.urls": 1, userId: 1 })
            .toArray()
        );

        const frontalImageObjects = progressOfTwins
          .map((rec) => {
            const frontalImage = rec.images.find(
              (io: { position: string; urls: any[] }) => io.position === "front"
            );
            if (!frontalImage) return null;

            const originalUrlObj = frontalImage.urls.find(
              (io: { name: string; url: string }) => io.name === "original"
            );
            if (!originalUrlObj) return null;

            return {
              userId: rec.userId,
              frontalImage: originalUrlObj.url,
            };
          })
          .filter(Boolean);

        const sideImageObjects = progressOfTwins
          .map((rec) => {
            const sideImage = rec.images.find(
              (io: { position: string; urls: any[] }) => io.position === "right"
            );
            if (!sideImage) return null;

            console.log("side image", sideImage);

            const originalUrlObj = sideImage.urls.find(
              (io: { name: string; url: string }) => io.name === "original"
            );
            if (!originalUrlObj) return null;

            return {
              userId: rec.userId,
              sideImage: originalUrlObj.url,
            };
          })
          .filter(Boolean);

        const closestDocumentsWithUser = [
          { userId: new ObjectId(userId), image },
          ...closestDocuments,
        ];

        const collageImageGroups: string[][] = closestDocumentsWithUser.map(
          (doc) => {
            const images: string[] = [doc.image];
            const relatedFrontalImageObject = frontalImageObjects.find(
              (rec) => String(rec.userId) === String(doc.userId)
            );
            if (relatedFrontalImageObject)
              images.push(relatedFrontalImageObject.frontalImage);

            const relatedSideImageObject = sideImageObjects.find(
              (rec) => String(rec.userId) === String(doc.userId)
            );
            if (relatedSideImageObject)
              images.push(relatedSideImageObject.sideImage);
            return [...new Set(images)];
          }
        );

        const collageImage = await createImageCollage({
          images: collageImageGroups,
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
            { ...registryFilter, userId: new ObjectId(userId) },
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
