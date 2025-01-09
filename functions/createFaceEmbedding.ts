import * as dotenv from "dotenv";
dotenv.config();

import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";

export default async function createFaceEmbedding(image: string) {
  try {
    const response = await doWithRetries(async () =>
      fetch(`${process.env.PROCESSING_SERVER_URL}/createHumanEmbedding`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: process.env.PROCESSING_SECRET,
        },
        body: JSON.stringify({ image }),
      })
    );

    if (!response.ok) {
      const json = await response.json();

      throw httpError(json.error);
    }

    const data = await response.json();

    return data.message;
  } catch (err) {
    throw httpError(err);
  }
}
