import { ObjectId, Sort } from "mongodb";
import { NextFunction, Router } from "express";
import aqp from "api-query-params";
import { ModerationStatusEnum, CustomRequest } from "types.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:followingUserName?",
  async (req: CustomRequest, res, next: NextFunction) => {
    const { followingUserName } = req.params;
    const { filter, skip, sort } = aqp(req.query);
    const { type, part, position } = filter;

    if (!followingUserName && !req.userId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const filter: { [key: string]: any } = {
        isPublic: true,
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      if (followingUserName) {
        const { inClub, isFollowing, isSelf, subscriptionActive } =
          await checkTrackedRBAC({
            userId: req.userId,
            followingUserName,
          });

        if (!inClub || !isFollowing || !subscriptionActive) {
          res.status(200).json({ message: [] });
          return;
        }

        if (isSelf) {
          delete filter.isPublic;
        }
      }

      if (followingUserName) {
        filter.name = followingUserName;
      } else {
        filter.userId = new ObjectId(req.userId);
      }

      if (type) filter.type = type;
      if (part) filter.part = part;
      if (position) filter.images.position = position;

      const projection: { [key: string]: any } = {
        _id: 1,
        type: 1,
        part: 1,
        isPublic: 1,
        images: 1,
        initialImages: 1,
        scores: 1,
        createdAt: 1,
        scoresDifference: 1,
        initialDate: 1,
        userId: 1,
      };

      const progress = await doWithRetries(async () =>
        db
          .collection("Progress")
          .find(filter, {
            projection,
          })
          .sort((sort as Sort) || { createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(21)
          .toArray()
      );

      res.status(200).json({ message: progress });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
