import * as dotenv from "dotenv";
dotenv.config();

import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";

export default async function createHumanEmbedding(image: string) {
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
      const data = await response.json();

      if (data.error === "person not found") {
        throw httpError("Can't see anyone on the photo.", 200);
      }

      if (data.error === "more than one person") {
        throw httpError("There can only be one person on the photo.", 200);
      }

      if (data.error === "minor") {
        throw httpError("The person on the image seems to be a minor.", 200);
      }

      throw httpError(data.error);
    }

    const data = await response.json();

    return data.message;
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
