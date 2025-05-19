import { ObjectId } from "mongodb";
import { NextFunction, Router } from "express";
import aqp, { AqpQuery } from "api-query-params";
import { ModerationStatusEnum, CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, skip, sort } = aqp(req.query as any) as AqpQuery;
    const { part, concern } = filter;

    if (!userName && !req.userId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      let progress = [];

      let finalFilter: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
        deletedOn: { $exists: false },
      };

      if (part) finalFilter.part = part;
      if (concern) finalFilter.concerns = { $in: [concern] };

      const projection: { [key: string]: any } = {
        _id: 1,
        isPublic: 1,
        createdAt: 1,
        concernScores: 1,
        concernScoresDifference: 1,
        initialDate: 1,
        userId: 1,
        concerns: 1,
        part: 1,
        deletedOn: 1,
      };

      if (userName) {
        finalFilter.userName = userName;
        projection["images.mainUrl"] = 1;
        projection["initialImages.mainUrl"] = 1;
        finalFilter.isPublic = true;
      } else {
        if (req.userId) {
          finalFilter.userId = new ObjectId(req.userId);
          projection["images"] = 1;
          projection["initialImages"] = 1;
        }
      }

      if (concern)
        finalFilter.concerns = {
          $in: Array.isArray(concern) ? concern : [concern],
        };
      if (part) finalFilter.part = part;

      progress = await doWithRetries(async () =>
        db
          .collection("Progress")
          .aggregate([
            { $match: finalFilter },
            {
              $project: projection,
            },
            { $sort: sort || { _id: -1 } },
            { $skip: Number(skip) || 0 },
            { $limit: 21 },
          ])
          .toArray()
      );

      res.status(200).json({
        message: { data: progress },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
