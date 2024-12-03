import * as dotenv from "dotenv";
dotenv.config();

import { replicate } from "init.js";
import httpError from "@/helpers/httpError.js";

export default async function createImageEmbedding(
  imageUrl: string
): Promise<number[]> {
  try {
    const payload: { [key: string]: any } = {
      modality: "vision",
      input: imageUrl,
    };

    const result = await replicate.run(
      "daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304",
      {
        input: payload,
      }
    );

    return result as number[];
  } catch (err) {
    throw httpError(err);
  }
}
