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

    let result = {
      message: null as number[],
      errorMessage: "",
    };

    if (!response.ok) {
      const data = await response.json();

      if (data.error === "minor") {
        result.errorMessage = "The person on the photo appears to be a minor.";
        return result;
      }

      throw httpError(data.error);
    }

    const data = await response.json();
    result.message = data.message;

    return result;
  } catch (err) {
    throw httpError(err);
  }
}
