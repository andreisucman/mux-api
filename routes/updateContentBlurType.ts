import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import {
  BlurredUrlType,
  BlurTypeEnum,
  CustomRequest,
  ProgressImageType,
  ProgressType,
} from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import blurContent from "functions/blurContent.js";
import { db } from "init.js";

const route = Router();

type UpdateProgressRecordProps = {
  images: ProgressImageType[];
  blurType: BlurTypeEnum;
};

type UpdateStyleRecord = {
  urls: BlurredUrlType[];
  mainUrl: BlurredUrlType;
  blurType: BlurTypeEnum;
};

async function updateProgressRecord({
  images,
  blurType,
}: UpdateProgressRecordProps) {
  const image = images[0];
  const { urls } = image;

  const existingBlurRecord = urls.find(
    (rec: { name: string }) => rec.name === blurType
  );

  if (existingBlurRecord) {
    const newImages = [];

    for (const imageObject of images) {
      const newMainUrl = imageObject.urls.find((obj) => obj.name === blurType);

      if (newMainUrl) {
        newImages.push({
          ...imageObject,
          mainUrl: newMainUrl,
          urls: imageObject.urls,
        });
      }
    }

    return { images: newImages };
  } else {
    const promises = images.map((obj: { mainUrl: BlurredUrlType }) =>
      blurContent({
        blurType,
        endpoint: "blurImage",
        originalUrl: obj.mainUrl.url,
      })
    );

    const blurredImages = await Promise.all(promises);

    const newImages = [];

    for (let i = 0; i < blurredImages.length; i++) {
      const newUrl = { name: blurType, url: blurredImages[i].url };

      const updatedUrls = images[i].urls.filter((obj) => obj.name !== blurType);
      updatedUrls.push(newUrl);

      newImages.push({
        ...images[i],
        mainUrl: newUrl,
        urls: updatedUrls,
      });
    }
    return { images: newImages };
  }
}

async function updateStyleRecord({
  urls,
  mainUrl,
  blurType,
}: UpdateStyleRecord) {
  const existingBlurRecord = urls.find(
    (rec: { name: string }) => rec.name === blurType
  );

  if (existingBlurRecord) {
    return { mainUrl: existingBlurRecord };
  } else {
    const blurredImage = await blurContent({
      blurType,
      endpoint: "blurImage",
      originalUrl: mainUrl.url,
    });

    const newUrl = { name: blurType, url: blurredImage.url };
    return { mainUrl: newUrl, urls: [...urls, newUrl] };
  }
}

route.post("/", async (req: CustomRequest, res: Response) => {
  const { blurType, contentCategory, contentId } = req.body;

  if (!ObjectId.isValid(contentId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  if (!["face", "eyes", "original"].includes(blurType)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  if (!["progress", "style", "proof"].includes(contentCategory)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  const collection =
    contentCategory === "progress"
      ? "Progress"
      : contentCategory === "style"
      ? "StyleAnalysis"
      : "Proof";

  try {
    const relevantRecord = await doWithRetries({
      functionName: "updateContentBlurType - find record",
      functionToExecute: async () =>
        db.collection(collection).findOne(
          { _id: new ObjectId(contentId), userId: new ObjectId(req.userId) },
          {
            projection: {
              images: 1,
              mainUrl: 1,
              urls: 1,
              thumbnails: 1,
              initialImages: 1,
            },
          }
        ),
    });

    let message: { [key: string]: any } = {};

    if (contentCategory === "progress") {
      const { images, initialImages } = relevantRecord as ProgressType;

      const { images: updatedImages } = await updateProgressRecord({
        images,
        blurType,
      });

      const { images: updatedInitialImages } = await updateProgressRecord({
        images: initialImages,
        blurType,
      });

      message = {
        ...message,
        images: updatedImages,
        initialImages: updatedInitialImages,
      };
    } else {
      const { mainUrl, urls, thumbnails } = relevantRecord;

      const existingBlurRecord = urls.find(
        (rec: { name: string }) => rec.name === blurType
      );

      const existingThumbnailRecord = thumbnails.find(
        (rec: { name: string }) => rec.name === blurType
      );

      if (existingBlurRecord) {
        message.mainUrl = existingBlurRecord;
        message.mainThumbnail = existingThumbnailRecord;
      } else {
        if (contentCategory === "proof") {
          const extension = mainUrl.url.split(".").pop();
          const isVideo = extension === "webm" || extension === "mp4";

          const blurredVideoResponse = await blurContent({
            blurType,
            endpoint: isVideo ? "blurVideo" : "blurImage",
            originalUrl: mainUrl.url,
          });

          const { hash, url, thumbnail } = blurredVideoResponse || {};

          if (url) {
            const newMainUrl = { name: blurType, url };
            const newUrls = [...urls, newMainUrl];
            const newMainThumbnail = { name: blurType, url: thumbnail };
            const newThumbnails = [...thumbnails, newMainThumbnail];

            message.mainUrl = newMainUrl;
            message.urls = newUrls;
            message.mainThumbnail = newMainThumbnail;
            message.thumbnails = newThumbnails;
          } else {
            message.hash = hash;
          }
        } else {
          const updateStyleResult = await updateStyleRecord({
            blurType,
            mainUrl,
            urls,
          });

          message = { ...message, ...updateStyleResult };
        }
      }
    }

    await doWithRetries({
      functionName: "updateContentBlurType - update",
      functionToExecute: async () =>
        db
          .collection(collection)
          .updateOne({ _id: new ObjectId(contentId) }, { $set: message }),
    });

    res.status(200).json({ message });
  } catch (error) {
    addErrorLog({
      functionName: "updateContentBlurType",
      message: error.message,
    });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
