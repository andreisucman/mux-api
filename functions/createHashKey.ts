import crypto from "crypto";
import doWithRetries from "@/helpers/doWithRetries.js";

export async function createHashKey(url: string) {
  try {
    const arrayBuffer = await doWithRetries({
      functionName: "createHashKey - promises",
      functionToExecute: async () => {
        if (url.startsWith("http")) {
          const res = await fetch(url);

          if (!res.ok) {
            throw new Error(
              `Failed to fetch ${url}: ${res.status} ${res.statusText}`
            );
          }
          return await res.arrayBuffer();
        } else {
          return await fs.promises.readFile(url);
        }
      },
    });

    const base64String = Buffer.from(arrayBuffer).toString("base64");
    const base64Uri = base64String.split(",").pop();
    return crypto.createHash("sha256").update(base64Uri).digest("hex");
  } catch (err) {
    console.log("Error in createHashKey: ", err);
    throw err;
  }
}
