import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

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
    addErrorLog({
      message: err.message,
      functionName: `uploadProof - extractImagesFromVideo`,
    });
    throw err;
  }
}
