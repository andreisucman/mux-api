import { ObjectId } from "mongodb";
import { NextFunction, Router } from "express";
import aqp, { AqpQuery } from "api-query-params";
import { ModerationStatusEnum, CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { filterData } from "@/functions/filterData.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, skip, sort } = aqp(req.query as any) as AqpQuery;
    const { part } = filter;

    if (!userName && !req.userId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const filter: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
        deletedOn: { $exists: false },
      };

      if (part) filter.part = part;

      const projection: { [key: string]: any } = {
        _id: 1,
        part: 1,
        isPublic: 1,
        images: 1,
        initialImages: 1,
        scores: 1,
        createdAt: 1,
        scoresDifference: 1,
        initialDate: 1,
        userId: 1,
        deletedOn: 1,
      };

      if (userName) {
        filter.userName = userName;
        projection.images = {
          $filter: {
            input: "$images",
            as: "image",
            cond: { $eq: ["$$image.name", "original"] },
          },
        };
      } else {
        filter.userId = new ObjectId(req.userId);
      }

      const progress = await doWithRetries(async () =>
        db
          .collection("Progress")
          .aggregate([
            { $match: filter },
            {
              $project: projection,
            },
            { $sort: sort || { createdAt: -1 } },
            { $skip: Number(skip) || 0 },
            { $limit: 21 },
          ])
          .toArray()
      );

      let response = { priceData: null, data: progress, notPurchased: [] };

      if (userName) {
        if (progress.length) {
          const result = await filterData({
            part,
            array: progress,
            dateKey: "createdAt",
            maskFunction: null,
            userId: req.userId,
          });

          response.priceData = result.priceData;
          response.data = result.data;
          response.notPurchased = result.notPurchased;
        }
      }

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
