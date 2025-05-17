import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, PartEnum } from "types.js";
import { ObjectId, Sort } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

const route = Router();

export type ViewRecordType = {
  userId: ObjectId;
  part: PartEnum;
  concern: string;
  updatedAt: Date;
  views: number;
  earned: number;
};

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip, filter, sort } = aqp(req.query as any) as AqpQuery;
    const { interval = "day" } = filter;

    try {
      const finalFilter: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
      };

      const projection: { [key: string]: any } = { concern: 1, part: 1 };

      switch (interval) {
        case "day":
          projection.viewsDay = 1;
          projection.earnedDay = 1;
          break;
        case "week":
          projection.viewsWeek = 1;
          projection.earnedWeek = 1;
          break;
        case "month":
          projection.viewsMonth = 1;
          projection.earnedMonth = 1;
          break;
      }

      const viewRecords = await doWithRetries(() =>
        db
          .collection("ViewTotal")
          .find(finalFilter)
          .skip(skip || 0)
          .sort((sort || { views: -1 }) as Sort)
          .project(projection)
          .toArray()
      );

      res.status(200).json({ message: viewRecords });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
