import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { daysFrom } from "@/helpers/utils.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import doWithRetries from "helpers/doWithRetries.js";
import aqp, { AqpQuery } from "api-query-params";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { filter } = aqp(req.query as any) as AqpQuery;
  const { status, dateFrom, dateTo, key } = filter;

  try {
    const timeZone = req.timeZone;
    let startsAtFrom = setToMidnight({ date: new Date(), timeZone });
    let startsAtTo = setToMidnight({ date: daysFrom({ days: 7 }), timeZone });

    if (dateFrom) startsAtFrom = setToMidnight({ date: dateFrom, timeZone });
    if (dateTo) startsAtTo = setToMidnight({ date: dateTo, timeZone });

    const filter: { [key: string]: any } = {
      userId: new ObjectId(req.userId),
      startsAt: {
        $gte: startsAtFrom,
        $lte: startsAtTo,
      },
    };

    if (status) filter.status = status;
    if (key) filter.key = key;

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
        .sort({ startsAt: 1, part: -1, name: 1 })
        .toArray()
    );

    res.status(200).json({ message: tasks });
  } catch (err) {
    next(err);
  }
});

export default route;
