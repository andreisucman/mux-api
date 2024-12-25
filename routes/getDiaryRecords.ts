import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { ModerationStatusEnum } from "types.js";
import checkTrackedRBAC from "@/functions/checkTrackedRBAC.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { type } = req.query;

    try {
      if (userName) {
        const { inClub, isFollowing } = await checkTrackedRBAC({
          followingUserName: userName,
          userId: req.userId,
          throwOnError: false,
        });

        if (!inClub || !isFollowing) {
          res.status(200).json({ message: [] });
          return;
        }
      }
      const filters: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      if (userName) filters.isPublic = true;
      if (type) filters.type = type;

      const diary = await doWithRetries(async () =>
        db.collection("Diary").find(filters).sort({ createdAt: -1 }).toArray()
      );

      res.status(200).json({ message: diary });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
