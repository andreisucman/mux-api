import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import setUtcMidnight from "helpers/setUtcMidnight.js";
import { CustomRequest } from "types.js";
import aqp, { AqpQuery } from "api-query-params";
import { db } from "init.js";
import { daysFrom } from "@/helpers/utils.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { filter } = aqp(req.query as any) as AqpQuery;
    const { status, timeZone, dateFrom, dateTo, key } = filter;

    if (!timeZone) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const filter: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        startsAt: {
          $gte: setUtcMidnight({
            date: new Date(),
            timeZone: String(timeZone),
          }),
          $lte: setUtcMidnight({
            date: daysFrom({ days: 7 }),
            timeZone: String(timeZone),
          }),
        },
      };

      if (status) filter.status = status;

      if (dateFrom)
        filter.startsAt = {
          $gte: daysFrom({ date: dateFrom, days: -1 }),
        };

      if (dateTo)
        filter.startsAt = {
          ...filter.startsAt,
          $lte: dateTo,
        };

      if (key) {
        filter.key = key;
      }

      const tasks = await doWithRetries(async () =>
        db
          .collection("Task")
          .find(filter)
          .project({
            _id: 1,
            name: 1,
            key: 1,
            color: 1,
            status: 1,
            icon: 1,
            expiresAt: 1,
            startsAt: 1,
          })
          .sort({ startsAt: 1 })
          .limit(Number(process.env.MAX_TASKS_PER_SCHEDULE))
          .toArray()
      );

      res.status(200).json({ message: tasks });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
