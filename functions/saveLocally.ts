import path from "path";
import { nanoid } from "nanoid";
import fs from "fs/promises";
import os from "os";
import addErrorLog from "functions/addErrorLog.js";

const tempDir = os.tmpdir();

export async function saveLocally(image: string) {
  try {
    const pathAddress = path.join(tempDir, `moderation-${nanoid()}`);
    const bufferResponse = await fetch(image);
    const arrayBuffer = await bufferResponse.arrayBuffer();
    await fs.writeFile(pathAddress, Buffer.from(arrayBuffer));
    return pathAddress;
  } catch (err) {
    addErrorLog({ message: err.message, functionName: "saveLocally" });
    throw err;
  }
}
