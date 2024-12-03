import httpError from "@/helpers/httpError.js";
import doWithRetries from "helpers/doWithRetries.js";

export default async function extractImagesFromVideo(url: string) {
  try {
    const response = await doWithRetries({
      functionName: "extractImagesFromVideo",
      functionToExecute: async () =>
        fetch(`${process.env.PROCESSING_SERVER_URL}/analyzeVideo`, {
          headers: {
            Authorization: process.env.PROCESSING_SECRET,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({ url }),
        }), // don't check network status
    });

    return await response.json();
  } catch (err) {
    throw httpError(err);
  }
}
