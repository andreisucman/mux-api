import httpError from "@/helpers/httpError.js";
import { CookieOptions } from "express";
import blurContent from "functions/blurContent.js";
import { BlurTypeEnum } from "types.js";

type Props = {
  cookies: CookieOptions;
  url: string;
  blurType: BlurTypeEnum;
  thumbnail?: string;
};

export default async function getReadyBlurredUrls({
  url,
  blurType,
  thumbnail,
  cookies,
}: Props) {
  try {
    const urlExtension = url.includes(".") ? url.split(".").pop() : "";

    let mainUrl = { name: "original" as "original", url };
    let urls = [mainUrl];

    let mainThumbnail;
    let thumbnails;

    if (thumbnail) {
      mainThumbnail = { name: "original" as "original", url: thumbnail };
      thumbnails = [mainThumbnail];
    }

    if (blurType !== "original") {
      const endpoint = urlExtension === "jpg" ? "blurImageManually" : "blurVideo";

      const blurredUrlResponse = await blurContent({
        blurType,
        originalUrl: url,
        endpoint,
        cookies,
      });

      // at this point the blur should already exist, therefore the response will contain a url
      mainUrl = { name: blurType as "original", url: blurredUrlResponse.url };
      mainThumbnail = {
        name: blurType as "original",
        url: blurredUrlResponse.thumbnail,
      };
      urls.push(mainUrl);
      thumbnails.push(mainThumbnail);
    }

    return { mainUrl, mainThumbnail, urls, thumbnails };
  } catch (err) {
    throw httpError(err);
  }
}
