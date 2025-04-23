import { ObjectId } from "mongodb";
import { NextFunction, Router } from "express";
import aqp, { AqpQuery } from "api-query-params";
import { ModerationStatusEnum, CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import getPurchasedFilters, { PriceDataType, PurchaseType } from "@/functions/getPurchasedFilters.js";

const route = Router();

route.get("/:userName?", async (req: CustomRequest, res, next: NextFunction) => {
  const { userName } = req.params;
  const { filter, skip, sort } = aqp(req.query as any) as AqpQuery;
  const { part, concern } = filter;

  if (!userName && !req.userId) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    let purchases: PurchaseType[] = [];
    let notPurchased: string[] = [];
    let priceData: PriceDataType[] = [];
    let progress = [];

    let finalFilter: { [key: string]: any } = {
      moderationStatus: ModerationStatusEnum.ACTIVE,
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

      const response = await getPurchasedFilters({
        userId: req.userId,
        userName,
        concern,
        part,
      });
      purchases = response.purchases;
      priceData = response.priceData;
      notPurchased = response.notPurchased;

      if (priceData.length === 0) {
        finalFilter.isPublic = true;
      } else {
        finalFilter.$and = [
          { concerns: { $in: priceData.map((o) => o.concern) } },
          { part: { $in: priceData.map((o) => o.part) } },
        ];
        if (concern) finalFilter.$and.push({ concerns: { $in: [concern] } });
        if (part) finalFilter.$and.push({ part });
      }
    } else {
      if (req.userId) {
        finalFilter.userId = new ObjectId(req.userId);
        projection["images"] = 1;
        projection["initialImages"] = 1;
      } else {
        finalFilter.isPublic = true;
        finalFilter.deletedOn = { $exists: false };
      }
    }

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
      message: { data: progress, purchases, notPurchased, priceData },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
