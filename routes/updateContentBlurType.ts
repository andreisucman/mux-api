import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, ProgressType } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { url, contentId, blurDots } = req.body;

  if (!ObjectId.isValid(contentId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const relevantRecord = (await doWithRetries(async () =>
      db.collection("Progress").findOne(
        { _id: new ObjectId(contentId), userId: new ObjectId(req.userId) },
        {
          projection: {
            images: 1,
          },
        }
      )
    )) as unknown as ProgressType;

    const { images } = relevantRecord as ProgressType;

    const relevantImageObject = images.find((imageObj) => imageObj.urls.some((urlObj) => urlObj.url === url));

    const updatePayload: { [key: string]: any } = {};
    let updatedImages;
    let newMainUrl;

    if (blurDots.length) {
      const cookieString = Object.entries(req.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");

      const response = await doWithRetries(() =>
        fetch(`${process.env.PROCESSING_SERVER_URL}/blurImageManually`, {
          method: "POST",
          body: JSON.stringify({ blurDots, url, resetOld: true }),
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieString,
          },
        })
      );

      if (!response.ok) throw httpError("Network error during blur");

      const json = await response.json();
      newMainUrl = { name: "blurred", url: json.message };

      const newUrls = [{ name: "original", url }, newMainUrl];

      const newRelevantImageObject = {
        ...relevantImageObject,
        mainUrl: newMainUrl,
        urls: newUrls,
      };

      updatedImages = images.map((io) =>
        io.urls.some((urlObj) => urlObj.url === url) ? { ...io, ...newRelevantImageObject } : io
      );
    } else {
      const currentBlurType = relevantImageObject.mainUrl.name;

      const newMainUrlObject = relevantImageObject.urls.find((urlObj) => urlObj.name !== currentBlurType);

      if (newMainUrlObject) newMainUrl = newMainUrlObject;

      const newRelevantImageObject = {
        ...relevantImageObject,
        mainUrl: newMainUrl,
      };

      updatedImages = images.map((io) =>
        io.urls.some((urlObj) => urlObj.url === url) ? { ...io, ...newRelevantImageObject } : io
      );
    }

    updatePayload.$set = { images: updatedImages };

    await doWithRetries(async () =>
      db.collection("Progress").updateMany({ "images.urls.url": url, userId: new ObjectId(req.userId) }, updatePayload)
    );

    await doWithRetries(() =>
      db.collection("Progress").updateMany(
        {
          userId: new ObjectId(req.userId),
          "initialImages.urls.url": url,
        },
        { $set: { initialImages: updatedImages } }
      )
    );

    await doWithRetries(() =>
      db.collection("BeforeAfter").updateMany(
        {
          userId: new ObjectId(req.userId),
          "images.urls.url": url,
        },
        { $set: { images: updatedImages } }
      )
    );

    await doWithRetries(() =>
      db.collection("BeforeAfter").updateMany(
        {
          userId: new ObjectId(req.userId),
          "initialImages.urls.url": url,
        },
        { $set: { initialImages: updatedImages } }
      )
    );

    const updatedRecords = (await doWithRetries(async () =>
      db
        .collection("Progress")
        .find(
          { "initialImages.urls.url": url, userId: new ObjectId(req.userId) },
          {
            projection: {
              images: 1,
              initialImages: 1,
            },
          }
        )
        .toArray()
    )) as unknown as ProgressType;

    res.status(200).json({
      message: updatedRecords,
    });
  } catch (err) {
    next(err);
  }
});

export default route;
