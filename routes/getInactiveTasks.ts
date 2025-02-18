import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId, Sort } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import aqp, { AqpQuery } from "api-query-params";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip, filter, sort } = aqp(req.query as any) as AqpQuery;
    const { part, status } = filter;

    try {
      const payload: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
      };

      if (status) {
        payload.status = status;
      } else {
        payload.status = { $in: ["canceled", "expired", "completed"] };
      }

      if (part) payload.part = part;

      const inactiveTasks = await doWithRetries(async () =>
        db
          .collection("Task")
          .find(payload, {
            projection: {
              _id: 1,
              name: 1,
              key: 1,
              icon: 1,
              color: 1,
              status: 1,
              description: 1,
              completedAt: 1,
              expiresAt: 1,
            },
          })
          .skip(Number(skip) || 0)
          .sort((sort as Sort) || { startsAt: -1 })
          .toArray()
      );

      res.status(200).json({ message: inactiveTasks });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
