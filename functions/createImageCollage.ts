import "dotenv/config";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  images: string[][];
};

export default async function createImageCollage({ images }: Props) {
  try {
    const collageResponse = await doWithRetries(async () =>
      fetch(`${process.env.PROCESSING_SERVER_URL}/createCollage`, {
        method: "POST",
        body: JSON.stringify({
          images,
        }),
        headers: {
          "content-type": "application/json",
          authorization: `${process.env.PROCESSING_SECRET}`,
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
