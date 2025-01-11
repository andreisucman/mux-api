import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip, type } = req.query;

    try {
      const payload: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        status: "completed",
      };

      if (type) payload.type = type;

      const completedTasks = await doWithRetries(async () =>
        db
          .collection("Task")
          .find(payload, {
            projection: {
              _id: 1,
              name: 1,
              key: 1,
              icon: 1,
              color: 1,
              type: 1,
              description: 1,
              completedAt: 1,
            },
          })
          .skip(Number(skip) || 0)
          .toArray()
      );

      res.status(200).json({ message: completedTasks });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
