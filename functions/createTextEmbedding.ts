import * as dotenv from "dotenv";
dotenv.config();

import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { openai } from "init.js";

export default async function createTextEmbedding(
  text: string
): Promise<number[]> {
  if (!text) throw httpError("Text not provided");

  try {
    const embeddingObject = await doWithRetries({
      functionName: "createTextEmbedding",
      functionToExecute: async () =>
        openai.embeddings.create({
          model: "text-embedding-3-small",
          input: text,
          encoding_format: "float",
        }),
    });

    return embeddingObject.data[0].embedding;
  } catch (err) {
    throw httpError(err);
  }
}
