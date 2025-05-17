import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

const route = Router();

route.get(
  "/:userName",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { filter } = aqp(req.query as any) as AqpQuery;
    const { interval = "day", page = "routines" } = filter;
    const { userName } = req.params;

    try {
      const finalFilter: { [key: string]: any } = {
        userName,
        page,
      };

      const pipeline: any[] = [{ $match: finalFilter }];

      let key = "";
      const group: { [key: string]: any } = { _id: null };

      switch (interval) {
        case "day":
          key = "totalViewsDay";
          group[key] = { $sum: "$viewsDay" };
          break;
        case "week":
          key = "totalViewsWeek";
          group[key] = { $sum: "$viewsWeek" };
          break;
        case "month":
          key = "totalViewsMonth";
          group[key] = { $sum: "$viewsMonth" };
          break;
      }

      pipeline.push({ $group: group }, { $project: { [key]: 1 } });

      const total = await doWithRetries(() =>
        db.collection("ViewTotal").aggregate(pipeline).next()
      );

      res.status(200).json({ message: total?.[key] ?? 0 });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
