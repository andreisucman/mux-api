import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import setUtcMidnight from "helpers/setUtcMidnight.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { status, type, timeZone } = req.query;

    if (!status || !type || !timeZone) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const filter: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
      };

      if (type) filter.type = type;
      if (status) filter.status = status;

      if (status !== "expired" && timeZone) {
        filter.startsAt = {
          $gte: setUtcMidnight({
            date: new Date(),
            timeZone: String(timeZone),
          }),
        };
      }

      const tasks = await doWithRetries(async () =>
        db
          .collection("Task")
          .find(filter, {
            projection: {
              _id: 1,
              name: 1,
              key: 1,
              color: 1,
              status: 1,
              icon: 1,
              expiresAt: 1,
              startsAt: 1,
            },
          })
          .sort({ startsAt: 1 })
          .toArray()
      );

      res.status(200).json({ message: tasks });
    } catch (err) {
      next(httpError(err.message, err.status));
    }
  }
);

export default route;
