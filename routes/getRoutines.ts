import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import getPurchasedFilters, { PriceDataType, PurchaseType } from "@/functions/getPurchasedFilters.js";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, RoutineType } from "types.js";
import aqp, { AqpQuery } from "api-query-params";
import { maskRoutine } from "@/helpers/mask.js";
import { db } from "init.js";

const route = Router();

route.get("/:userName?", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { userName } = req.params;
  const { filter, projection, skip, sort } = aqp(req.query as any) as AqpQuery;
  const { concern, part, ...restFilter } = filter;

  try {
    let purchases: PurchaseType[] = [];
    let notPurchased: string[] = [];
    let priceData: PriceDataType[] = [];
    let routines = [];

    let finalFilters: { [key: string]: any } = {
      ...restFilter,
    };

    if (userName) {
      finalFilters.userName = userName;

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
        finalFilters.isPublic = true;
      } else {
        finalFilters.$and = [
          { concerns: { $in: priceData.map((o) => o.concern) } },
          { part: { $in: priceData.map((o) => o.part) } },
        ];
        if (concern) finalFilters.$and.push({ concerns: { $in: [concern] } });
        if (part) finalFilters.$and.push({ part });
      }
    } else {
      if (req.userId) {
        finalFilters.userId = new ObjectId(req.userId);
        finalFilters.deletedOn = { $exists: false };
      } else {
        finalFilters.isPublic = true;
        finalFilters.deletedOn = { $exists: false };
      }
    }

    const hasProjection = Object.keys(projection || {}).length > 0;

    const finalProjecton = hasProjection
      ? projection
      : {
          _id: 1,
          startsAt: 1,
          userId: 1,
          part: 1,
          allTasks: 1,
          concerns: 1,
          createdAt: 1,
          status: 1,
          lastDate: 1,
          isPublic: 1,
        };

    const finalSort = { ...(sort || { startsAt: -1 }) };

    routines = await doWithRetries(async () =>
      db
        .collection("Routine")
        .aggregate([
          { $match: finalFilters },
          { $project: finalProjecton },
          { $sort: finalSort },
          { $skip: Number(skip) || 0 },
          { $limit: 21 },
        ])
        .toArray()
    );

    if (userName) {
      if (purchases.length) {
        for (const obj of purchases) {
          const { contentEndDate } = obj;

          routines = routines.map((routine) => {
            return {
              ...routine,
              allTasks: routine.allTasks.map((t) => {
                const filteredIds = t.ids.map((obj) => {
                  const deletedWithinSubscriptionPeriod =
                    !obj.deletedOn || new Date(obj.deletedOn) <= new Date(contentEndDate);

                  if (deletedWithinSubscriptionPeriod) delete obj.deleteOn;

                  return obj;
                });
                return {
                  ...t,
                  ids: filteredIds,
                };
              }),
            };
          });
        }
      } else {
        routines = routines.map((r) => maskRoutine(r as RoutineType));
      }
    }

    res.status(200).json({
      message: { data: routines, purchases, notPurchased, priceData },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
