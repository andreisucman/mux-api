import { ObjectId, Sort } from "mongodb";
import { NextFunction, Router } from "express";
import aqp, { AqpQuery } from "api-query-params";
import { ModerationStatusEnum, CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import { filterData } from "@/functions/filterData.js";

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

      if (userName) {
        filter.userName = userName;
      } else {
        filter.userId = new ObjectId(req.userId);
      }

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

      let response = { priceData: null, data: progress };

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
        }
      }

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
