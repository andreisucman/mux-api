import { Response, Router, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { hash, blurType } = req.body;

    try {
      const job = await doWithRetries(async () =>
        db.collection("BlurProcessingStatus").findOne(
          {
            hash,
            blurType,
          },
          {
            projection: {
              _id: 0,
              url: 1,
              updatedAt: 1,
              thumbnail: 1,
              progress: 1,
              blurType: 1,
              isRunning: 1,
            },
          }
        )
      );

      if (!job) {
        res.status(200).json({
          error: "This job does not exist. Please try again.",
        });
        return;
      }

      if (job.isError) {
        res.status(200).json({
          error: job.message || "An error occured. Please try again.",
        });
        return;
      }

      if (job.isRunning) {
        res.status(200).json({
          message: {
            progress: Math.round(job.progress),
            isRunning: job.isRunning,
          },
        });
        return;
      }

      const proofRecord = await doWithRetries(async () =>
        db.collection("Proof").findOne(
          {
            hash,
          },
          { projection: { urls: 1, thumbnails: 1 } }
        )
      );

      let newMainUrl = { name: job.blurType, url: job.url };
      let newMainThumbnail = { name: job.blurType, url: job.thumbnail };

      if (proofRecord) {
        const newUrls = [...proofRecord.urls, newMainUrl];
        const newThumbnails = [...proofRecord.thumbnails, newMainThumbnail];

        await doWithRetries(async () =>
          db.collection("Proof").updateOne(
            {
              _id: new ObjectId(proofRecord._id),
            },
            {
              $set: {
                mainUrl: newMainUrl,
                urls: newUrls,
                mainThumbnail: newMainThumbnail,
                thumbnails: newThumbnails,
              },
            }
          )
        );
      }

      res.status(200).json({
        message: {
          progress: 100,
          isRunning: false,
          mainUrl: newMainUrl,
          mainThumbnail: newMainThumbnail,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
