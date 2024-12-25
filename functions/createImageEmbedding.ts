import * as dotenv from "dotenv";
dotenv.config();

import { replicate } from "init.js";
import updateSpend from "./updateSpend.js";
import httpError from "@/helpers/httpError.js";
import { CategoryNameEnum } from "@/types.js";

export default async function createImageEmbedding(
  imageUrl: string,
  userId: string,
  categoryName: CategoryNameEnum
): Promise<number[]> {
  try {
    const payload: { [key: string]: any } = {
      modality: "vision",
      input: imageUrl,
    };

    const model =
      "daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304";
    const unitCost = Number(process.env.IMAGE_EMBEDDING_PRICE) / 1000000;

    const result = await replicate.run(model, {
      input: payload,
    });

    updateSpend({
      functionName: "createImageEmbedding",
      modelName: model,
      categoryName,
      unitCost,
      units: 1,
      userId,
    });

    return result as number[];
  } catch (err) {
    throw httpError(err);
  }
}
