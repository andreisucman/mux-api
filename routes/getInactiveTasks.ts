import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import aqp, { AqpQuery } from "api-query-params";
import { CustomRequest } from "types.js";
import { setToUtcMidnight } from "@/helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip, filter, sort } = aqp(req.query as any) as AqpQuery;
    const { part, status } = filter;

    try {
      const finalFilter: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        expiresAt: { $lte: setToUtcMidnight(new Date()) },
      };

      const projection = {
        _id: 1,
        name: 1,
        key: 1,
        icon: 1,
        color: 1,
        status: 1,
        description: 1,
        completedAt: 1,
        startsAt: 1,
      };

      if (status) {
        finalFilter.status = status;
      } else {
        finalFilter.status = { $in: ["canceled", "expired", "completed"] };
      }

      if (part) finalFilter.part = part;
      const finalSort = sort || { startsAt: -1 };

      const inactiveTasks = await doWithRetries(async () =>
        db
          .collection("Task")
          .aggregate([
            { $match: finalFilter },
            {
              $project: projection,
            },
            { $sort: finalSort },
            { $skip: skip || 0 },
            { $sort: finalSort },
          ])
          .toArray()
      );

      res.status(200).json({ message: inactiveTasks });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
