import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction, CookieOptions } from "express";
import {
  BlurredUrlType,
  BlurTypeEnum,
  CustomRequest,
  ProgressImageType,
  ProgressType,
} from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import blurContent from "functions/blurContent.js";
import { db } from "init.js";

const route = Router();

type UpdateProgressRecordProps = {
  images: ProgressImageType[];
  blurType: BlurTypeEnum;
  cookies: CookieOptions;
};

async function getUpdatedProgressRecord({
  images,
  cookies,
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
    const promises = images.map((obj: ProgressImageType) => {
      const original = obj.urls.find((urlObj) => urlObj.name === "original");

      return blurContent({
        blurType,
        cookies,
        endpoint: "blurImage",
        originalUrl: original.url,
      });
    });

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

type UpdateDiaryRecordProps = {
  contentId: string;
  newUrl: string;
};

async function updateDiaryRecord({
  contentId,
  newUrl,
}: UpdateDiaryRecordProps) {
  /* update diary activities */
  const relevantDiaryRecord = await doWithRetries(async () =>
    db
      .collection("Diary")
      .findOne(
        { "activity.contentId": contentId },
        { projection: { activity: 1 } }
      )
  );

  if (relevantDiaryRecord) {
    const activity = relevantDiaryRecord.activity.map((a) =>
      a.contentId === contentId ? { ...a, url: newUrl } : a
    );

    await doWithRetries(async () =>
      db
        .collection("Diary")
        .updateOne(
          { _id: new ObjectId(relevantDiaryRecord._id) },
          { $set: { activity } }
        )
    );
  }
}

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { blurType, contentCategory, contentId } = req.body;

    if (
      !ObjectId.isValid(contentId) ||
      !["blurred", "original"].includes(blurType) ||
      !["progress", "proof"].includes(contentCategory)
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const collection = contentCategory === "progress" ? "Progress" : "Proof";

    try {
      const relevantRecord = await doWithRetries(async () =>
        db.collection(collection).findOne(
          { _id: new ObjectId(contentId), userId: new ObjectId(req.userId) },
          {
            projection: {
              images: 1,
              urls: 1,
              thumbnails: 1,
              initialImages: 1,
              type: 1,
              part: 1,
            },
          }
        )
      );

      let message: { [key: string]: any } = {};

      if (contentCategory === "progress") {
        const { images, initialImages, part } = relevantRecord as ProgressType;

        const originalImage = images
          .filter((im) => im.position === "front")
          .flatMap((io) => io.urls.map((obj) => obj))
          .find((obj) => obj.name === "original");

        const { images: updatedImages } = await getUpdatedProgressRecord({
          images,
          blurType,
          cookies: req.cookies,
        });

        const { images: updatedInitialImages } = await getUpdatedProgressRecord(
          {
            images: initialImages,
            blurType,
            cookies: req.cookies,
          }
        );

        message = {
          images: updatedImages,
          initialImages: updatedInitialImages,
        };

        await doWithRetries(() =>
          db
            .collection("Progress")
            .updateOne(
              { _id: new ObjectId(relevantRecord._id) },
              { $set: message }
            )
        );

        await doWithRetries(() =>
          db.collection("BeforeAfter").updateOne(
            {
              userId: new ObjectId(req.userId),
              part,
              "images.urls.url": originalImage.url,
            },
            { $set: { images: updatedImages } }
          )
        );

        await doWithRetries(() =>
          db.collection("BeforeAfter").updateOne(
            {
              userId: new ObjectId(req.userId),
              part,
              "initialImages.urls.url": originalImage.url,
            },
            { $set: { initialImages: updatedImages } }
          )
        );
      } else {
        const { urls, thumbnails } = relevantRecord;

        const existingBlurRecord = urls.find(
          (rec: { name: string; url: string }) => rec.name === blurType
        );

        const existingThumbnailRecord = thumbnails.find(
          (rec: { name: string; url: string }) => rec.name === blurType
        );

        if (existingBlurRecord) {
          message.mainUrl = existingBlurRecord;
          message.mainThumbnail = existingThumbnailRecord;

          await doWithRetries(async () =>
            db
              .collection(collection)
              .updateOne({ _id: new ObjectId(contentId) }, { $set: message })
          );

          await updateDiaryRecord({
            contentId,
            newUrl: existingBlurRecord.url,
          });
        } else {
          const originalUrl = urls.find(
            (r: BlurredUrlType) => r.name === "original"
          );
          const extension = originalUrl.url.split(".").pop();
          const isVideo = extension === "webm" || extension === "mp4";

          const blurredVideoResponse = await blurContent({
            blurType,
            endpoint: isVideo ? "blurVideo" : "blurImage",
            originalUrl: originalUrl.url,
            cookies: req.cookies,
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

            await doWithRetries(async () =>
              db
                .collection(collection)
                .updateOne({ _id: new ObjectId(contentId) }, { $set: message })
            );

            await updateDiaryRecord({ contentId, newUrl: newMainUrl.url });
          } else {
            message.hash = hash;
          }
        }
      }

      res.status(200).json({ message });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
