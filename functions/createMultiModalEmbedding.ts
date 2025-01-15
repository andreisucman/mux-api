import * as dotenv from "dotenv";
dotenv.config();

import updateSpend from "./updateSpend.js";
import { CategoryNameEnum } from "types.js";
import { replicate } from "init.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  text: string;
  imageUrl: string;
  categoryName: CategoryNameEnum;
};

export default async function createMultimodalEmbedding({
  text,
  userId,
  imageUrl,
  categoryName,
}: Props): Promise<number[]> {
  try {
    const payload: { [key: string]: any } = {
      modality: "vision",
    };

    if (text) payload.text_input = text;
    if (imageUrl) payload.input = imageUrl;

    const model =
      "daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304";
    const unitCost = Number(process.env.IMAGE_EMBEDDING_PRICE);

    const result = await replicate.run(model, {
      input: payload,
    });

    updateSpend({
      functionName: "createMultimodalEmbedding",
      modelName: model,
      unitCost,
      units: 1,
      userId,
      categoryName,
    });

    return result as number[];
  } catch (err) {
    throw httpError(err);
  }
}
