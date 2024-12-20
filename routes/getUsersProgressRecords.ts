import { ObjectId } from "mongodb";
import { NextFunction, Router } from "express";
import { db } from "init.js";
import { ContentModerationStatusEnum, CustomRequest } from "types.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get(
  "/:followingUserName?",
  async (req: CustomRequest, res, next: NextFunction) => {
    const { type, part, position, skip } = req.query;
    const { followingUserName } = req.params;

    if (!followingUserName && !req.userId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      if (followingUserName) {
        const { inClub, isFollowing, subscriptionActive } =
          await checkTrackedRBAC({
            userId: req.userId,
            followingUserName,
          });

        if (!inClub || !isFollowing || !subscriptionActive) {
          res.status(200).json({ message: [] });
          return;
        }
      }

      const filter: { [key: string]: any } = {
        moderationStatus: ContentModerationStatusEnum.ACTIVE,
      };

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
          .sort({ createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(7)
          .toArray()
      );

      res.status(200).json({ message: progress });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
