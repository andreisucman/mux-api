import { ObjectId } from "mongodb";
import * as dotenv from "dotenv";
dotenv.config();

import httpError from "@/helpers/httpError.js";
import findEmbeddings from "./findEmbeddings.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

type Props = {
  userId?: string;
  image?: string;
  ipFingerprint?: string;
  embedding?: number[];
  category: "style" | "progress" | "food";
};

export default async function checkForTwins({
  userId,
  image,
  embedding,
  ipFingerprint,
  category,
}: Props) {
  try {
    let closestDocuments: any[] = [];

    if (embedding) {
      closestDocuments = await findEmbeddings({
        collection: "TwinRegistry",
        embedding,
        index: "twin_registry_search_vector",
        limit: 4,
        relatednessScore: 50,
        filters: { category },
        projection: { userId: 1 },
      });
    } else {
      closestDocuments = await doWithRetries(async () =>
        db
          .collection("TwinRegistry")
          .find({ ipFingerprint })
          .project({ userId: 1 })
          .toArray()
      );
    }

    const twinIds = closestDocuments.map((doc) => String(doc.userId));

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
