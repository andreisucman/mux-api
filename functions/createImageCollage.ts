import "dotenv/config";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  images: string[][] | string[];
  collageSize?: number;
};

export default async function createImageCollage({ images, collageSize }: Props) {
  try {
    const url = `${process.env.PROCESSING_SERVER_URL}/createGridCollage`;

    const payload = JSON.stringify({
      images,
      collageSize,
    });

    const collageResponse = await doWithRetries(async () =>
      fetch(url, {
        method: "POST",
        body: payload,
        headers: {
          "content-type": "application/json",
        },
      })
    );

    if (!collageResponse.ok) {
      const data = await collageResponse.json();
      throw httpError(JSON.stringify(data));
    }

    const { message: collageImage } = (await collageResponse.json()) || {};

    return collageImage;
  } catch (err) {
    throw httpError(err);
  }
}
