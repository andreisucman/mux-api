import * as dotenv from "dotenv";
dotenv.config();

import aqp from "api-query-params";
import { ObjectId, Sort } from "mongodb";
import { Router, Response, NextFunction } from "express";
import checkTrackedRBAC from "@/functions/checkTrackedRBAC.js";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum } from "types.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, sort, skip } = aqp(req.query);
    const { type } = filter;

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
        db
          .collection("Diary")
          .find(filters)
          .sort((sort as Sort) || { createdAt: -1 })
          .skip(skip || 0)
          .limit(21)
          .toArray()
      );

      res.status(200).json({ message: diary });
    } catch (err) {
      next(httpError(err.message, err.status));
    }
  }
);

export default route;
