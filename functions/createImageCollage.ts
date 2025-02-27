import "dotenv/config";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  images: string[][] | string[];
  collageSize?: number;
  isGrid: boolean;
};

export default async function createImageCollage({
  images,
  collageSize,
  isGrid,
}: Props) {
  try {
    const endpoint = isGrid ? "createGridCollage" : "createGroupCollage";

    const collageResponse = await doWithRetries(async () =>
      fetch(`${process.env.PROCESSING_SERVER_URL}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({
          images,
          collageSize,
        }),
        headers: {
          "content-type": "application/json",
        },
      })
    );

    if (!collageResponse.ok) {
      throw httpError("Server error");
    }

    const { message: collageImage } = (await collageResponse.json()) || {};

    return collageImage;
  } catch (err) {
    throw httpError(err);
  }
}
