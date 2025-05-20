import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "@/helpers/doWithRetries.js";
import getUserInfo from "@/functions/getUserInfo.js";
import { CustomRequest } from "types.js";
import { db } from "@/init.js";

const route = Router();

route.get(
  "/:userName",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { filter } = aqp(req.query as any) as AqpQuery;
    const { interval = "day", page = "routines" } = filter;
    const { userName } = req.params;

    try {
      const userInfo = await getUserInfo({ userName, projection: { _id: 1 } });

      const finalFilter: { [key: string]: any } = {
        userId: userInfo._id,
        page,
        interval,
      };

      const pipeline: any[] = [{ $match: finalFilter }];

      const group: { [key: string]: any } = {
        _id: null,
        total: { $sum: "$views" },
      };

      pipeline.push({ $group: group }, { $project: { total: 1 } });

      const result = await doWithRetries(() =>
        db.collection("ViewTotal").aggregate(pipeline).next()
      );

      res.status(200).json({ message: result?.total ?? 0 });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
