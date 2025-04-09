import * as dotenv from "dotenv";
dotenv.config();

import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";

export default async function createImageEmbedding(imageUrl: string): Promise<number[]> {
  try {
    const response = await doWithRetries(async () =>
      fetch(`${process.env.EMBEDDING_SERVER_URL}/createImageEmbedding`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          secret: process.env.EMBEDDING_SERVER_SECRET,
        },
        body: JSON.stringify({ image: imageUrl }),
      })
    );

    if (!response.ok) {
      const data = await response.json();
      throw httpError(data.error);
    }

    const data = await response.json();
    return data.message;
  } catch (err) {
    throw httpError(err);
  }
}
