import * as dotenv from "dotenv";
dotenv.config();

import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { openai } from "init.js";
import { CategoryNameEnum } from "@/types.js";
import updateSpend from "./updateSpend.js";

type Props = {
  userId?: string;
  text: string;
  dimensions: number;
  categoryName: CategoryNameEnum;
};

export default async function createTextEmbedding({
  userId,
  text,
  dimensions,
  categoryName,
}: Props): Promise<number[]> {
  if (!text) throw httpError("Text not provided");

  try {
    const model = "text-embedding-3-small";

    const embeddingObject = await doWithRetries(async () =>
      openai.embeddings.create({
        model,
        input: text,
        dimensions,
        encoding_format: "float",
      })
    );

    const unitCost = Number(process.env.TEXT_EMBEDDING_PRICE) / 1000000;
    const units = embeddingObject.usage.total_tokens;

    updateSpend({
      userId,
      unitCost,
      units,
      functionName: "createTextEmbedding",
      modelName: model,
      categoryName,
    });

    return embeddingObject.data[0].embedding;
  } catch (err) {
    throw httpError(err);
  }
}
