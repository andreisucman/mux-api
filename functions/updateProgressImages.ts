import * as dotenv from "dotenv";
dotenv.config();

import doWithRetries from "helpers/doWithRetries.js";
import { BlurTypeEnum, ProgressImageType } from "types.js";
import blurContent from "functions/blurContent.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  blurType: BlurTypeEnum;
  currentImages: ProgressImageType[];
};

export default async function updateProgressImages({
  currentImages,
  blurType,
}: Props) {
  try {
    const newImages: ProgressImageType[] = [];

    for (const currentImageObject of currentImages) {
      const newUrls = [...currentImageObject.urls].filter(
        (url) => url.name === "original"
      );

      if (blurType === "original") {
        newImages.push({
          position: currentImageObject.position,
          mainUrl: { name: "original", url: currentImageObject.mainUrl.url },
          urls: newUrls,
        });
      } else {
        const blurredImage = await doWithRetries(async () =>
          blurContent({
            originalUrl: currentImageObject.mainUrl.url,
            blurType,
            endpoint: "blurImage",
          })
        );

        if (blurredImage) {
          const mainUrl = {
            name: blurType,
            url: blurredImage.url,
          };

          newImages.push({
            position: currentImageObject.position,
            mainUrl,
            urls: [...newUrls, mainUrl],
          });
        }
      }
    }

    return newImages;
  } catch (err) {
    throw httpError(err);
  }
}
