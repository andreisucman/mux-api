import { FormData, File } from "formdata-node";
import * as dotenv from "dotenv";
import { getMimeType } from "helpers/utils.js";
import fs from "fs/promises";
import path from "path";
import httpError from "@/helpers/httpError.js";

dotenv.config();

export default async function checkForProhibitedContent(localFileUrl: string) {
  try {
    const form = new FormData();

    try {
      const fileBuffer = await fs.readFile(localFileUrl);

      const file = new File([fileBuffer], path.basename(localFileUrl), {
        type: getMimeType(localFileUrl),
      });

      form.append("content", file);
    } catch (err) {
      console.warn(
        `File does not exist or cannot be read and will be skipped: ${localFileUrl}, ${err.message}`
      );
    }

    if (form.entries().next().done) {
      console.warn("No valid files to upload.");
      return false;
    }

    const response = await fetch(
      `${process.env.MODERATION_SERVER_URL}/single/multipart-form`,
      {
        method: "POST",
        body: form,
      }
    );

    if (!response.ok) {
      throw httpError(
        `Server responded with ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();

    const relevant = data.prediction.filter((obj: any) =>
      ["Hentai", "Porn"].includes(obj.className)
    );

    const pornDetected = relevant.some((obj: any) => obj.probability > 0.8);

    return pornDetected;
  } catch (err) {
    throw httpError(err);
  }
}
