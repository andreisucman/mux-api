import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import aqp, { AqpQuery } from "api-query-params";
import { db } from "init.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, projection, skip, sort } = aqp(
      req.query as any
    ) as AqpQuery;
    const { concern, part, ...restFilter } = filter;

    try {
      let routines = [];

      let finalFilters: { [key: string]: any } = {
        ...restFilter,
        deletedOn: { $exists: false },
      };

      if (userName) {
        finalFilters.userName = userName;
        finalFilters.isPublic = true;
      } else {
        if (req.userId) finalFilters.userId = new ObjectId(req.userId);
      }

      if (part) finalFilters.part = part;

      if (concern)
        finalFilters.concerns = {
          $in: Array.isArray(concern) ? [concern[0]] : [concern],
        };

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

      res.status(200).json({
        message: { data: routines },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
