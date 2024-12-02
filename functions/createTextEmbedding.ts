import * as dotenv from "dotenv";
dotenv.config();

import addErrorLog from "functions/addErrorLog.js";
import doWithRetries from "helpers/doWithRetries.js";
import { openai } from "init.js";

export default async function createTextEmbedding(
  text: string
): Promise<number[]> {
  if (!text) throw new Error("Text not provided");

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
    addErrorLog({ functionName: "createTextEmbedding", message: err.message });
    throw err;
  }
}
