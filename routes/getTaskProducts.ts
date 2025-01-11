import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId } = req.body;

    if (!taskId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const taskInfo = await doWithRetries(async () =>
        db.collection("Task").findOne(
          { _id: new ObjectId(taskId) },
          {
            projection: {
              key: 1,
              name: 1,
              icon: 1,
              color: 1,
              startsAt: 1,
              suggestions: 1,
            },
          }
        )
      );

      res.status(200).json({ message: taskInfo });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
