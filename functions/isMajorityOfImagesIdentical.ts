import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

export default async function isMajorityOfImagesIdentical(...urls: string[]) {
  let isValid = false;
  try {
    const responses = await Promise.all(
      urls.map((url) =>
        doWithRetries(async () =>
          fetch(url).then((res) => {
            if (!res.ok) throw httpError("Network error");
            return res;
          })
        )
      )
    );
    const buffers = await Promise.all(
      responses.map((response) => response.arrayBuffer())
    );
    const base64Images = buffers.map((buffer) =>
      Buffer.from(buffer).toString("base64")
    );

    const uniqueImages = new Set(base64Images);

    const majority = Math.ceil(urls.length / 2);
    const duplicates = urls.length - uniqueImages.size;

    isValid = duplicates < majority;
  } catch (error) {
    throw httpError(error);
  } finally {
    return isValid;
  }
}
