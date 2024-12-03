import path from "path";
import { nanoid } from "nanoid";
import fs from "fs/promises";
import os from "os";
import httpError from "@/helpers/httpError.js";

const tempDir = os.tmpdir();

export async function saveLocally(image: string) {
  try {
    const pathAddress = path.join(tempDir, `moderation-${nanoid()}`);
    const bufferResponse = await fetch(image);
    const arrayBuffer = await bufferResponse.arrayBuffer();
    await fs.writeFile(pathAddress, Buffer.from(arrayBuffer));
    return pathAddress;
  } catch (err) {
    throw httpError(err);
  }
}
