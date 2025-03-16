import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import aqp, { AqpQuery } from "api-query-params";
import { db } from "init.js";
import { maskRoutine } from "@/helpers/mask.js";
import { filterData } from "@/functions/filterData.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, skip, sort = {} } = aqp(req.query as any) as AqpQuery;
    const { part, restOfFilter } = filter;

    try {
      const finalFilter: { [key: string]: any } = {
        ...restOfFilter,
      };

      if (userName) {
        finalFilter.userName = userName;
      } else {
        finalFilter.userId = new ObjectId(req.userId);
      }

      if (part) finalFilter.part = part;

      const projection = {
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

      const finalSort = { ...(sort || { _id: -1 }), status: 1 };

      const routines = await doWithRetries(async () =>
        db
          .collection("Routine")
          .aggregate([
            { $match: finalFilter },
            { $project: projection },
            { $sort: finalSort },
            { $skip: Number(skip) || 0 },
            { $limit: 21 },
          ])
          .toArray()
      );

      let response = { priceData: null, data: routines };

      if (userName) {
        if (routines.length) {
          const result = await filterData({
            part,
            array: routines,
            dateKey: "createdAt",
            maskFunction: maskRoutine,
            userId: req.userId,
          });

          response.priceData = result.priceData;
          response.data = result.data;
        }
      }

      res.status(200).json({
        message: response,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
