import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, RoutineType } from "types.js";
import aqp, { AqpQuery } from "api-query-params";
import { db } from "init.js";
import { maskRoutine } from "@/helpers/mask.js";
import getPurchasedFilters from "@/functions/getPurchasedFilters.js";

const route = Router();

route.get("/:userName?", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { userName } = req.params;
  const { filter, projection, skip, sort } = aqp(req.query as any) as AqpQuery;

  try {
    let purchases = [];
    let routines = [];
    let notPurchased = [];
    let priceData = [];

    let finalFilter: { [key: string]: any } = {
      ...filter,
    };

    if (userName) {
      finalFilter.userName = userName;

      const response = await getPurchasedFilters({
        userId: req.userId,
        userName,
        concern: filter.concern,
      });
      purchases = response.purchases;
      priceData = response.priceData;
      notPurchased = response.notPurchased;
      finalFilter = { ...finalFilter, ...response.additionalFilters };
    } else {
      if (req.userId) {
        finalFilter.userId = new ObjectId(req.userId);
        finalFilter.deletedOn = { $exists: false };
      } else {
        finalFilter.isPublic = true;
        finalFilter.deletedOn = { $exists: false };
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
          { $match: finalFilter },
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
