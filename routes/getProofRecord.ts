import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:taskId",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId } = req.params;

    if (!ObjectId.isValid(taskId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const record = await doWithRetries(async () =>
        db.collection("Proof").findOne(
          {
            taskId: new ObjectId(taskId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              contentType: 1,
              mainUrl: 1,
              urls: 1,
              createdAt: 1,
              hash: 1,
              isPublic: 1,
              mainThumbnail: 1,
              thumbnails: 1,
            },
          }
        )
      );

      res.status(200).json({ message: record });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
