import { ObjectId } from "mongodb";
import { NextFunction, Router } from "express";
import aqp, { AqpQuery } from "api-query-params";
import { ModerationStatusEnum, CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import getPurchasedFilters from "@/functions/getPurchasedFilters.js";

const route = Router();

route.get("/:userName?", async (req: CustomRequest, res, next: NextFunction) => {
  const { userName } = req.params;
  const { filter, skip, sort } = aqp(req.query as any) as AqpQuery;
  const { part } = filter;

  if (!userName && !req.userId) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    let purchases = [];
    let progress = [];
    let notPurchased = [];
    let priceData = [];

    let finalFilters: { [key: string]: any } = {
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    if (part) finalFilters.part = part;

    const projection: { [key: string]: any } = {
      _id: 1,
      part: 1,
      isPublic: 1,
      createdAt: 1,
      scoresDifference: 1,
      initialDate: 1,
      userId: 1,
      deletedOn: 1,
    };

    if (userName) {
      finalFilters.userName = userName;

      projection["images.mainUrl"] = 1;
      projection["initialImages.mainUrl"] = 1;

      const response = await getPurchasedFilters({
        userId: req.userId,
        userName,
        part,
      });
      purchases = response.purchases;
      priceData = response.priceData;
      notPurchased = response.notPurchased;
      finalFilters = { ...finalFilters, ...response.additionalFilters };
    } else {
      if (req.userId) {
        finalFilters.userId = new ObjectId(req.userId);
        projection["images"] = 1;
        projection["initialImages"] = 1;
      } else {
        finalFilters.isPublic = true;
        finalFilters.deletedOn = { $exists: false };
      }
    }

    progress = await doWithRetries(async () =>
      db
        .collection("Progress")
        .aggregate([
          { $match: finalFilters },
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
      message: { data: progress, purchases, notPurchased, priceData },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
