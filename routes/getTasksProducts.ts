import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, TaskStatusEnum } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { type } = req.query;
    try {
      const filter: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        expiresAt: { $gt: new Date() },
        status: TaskStatusEnum.ACTIVE,
      };

      if (type) filter.type = type;

      const distinctTasks = await doWithRetries(async () =>
        db
          .collection("Task")
          .aggregate([
            { $match: filter },
            { $sort: { startsAt: 1 } },
            {
              $group: {
                _id: "$key",
                tempId: { $first: "$_id" },
                name: { $first: "$name" },
                key: { $first: "$key" },
                color: { $first: "$color" },
                icon: { $first: "$icon" },
                startsAt: { $first: "$startsAt" },
                suggestions: { $first: "$suggestions" },
              },
            },
            {
              $project: {
                _id: "$tempId",
                name: 1,
                key: 1,
                color: 1,
                icon: 1,
                startsAt: 1,
                suggestions: 1,
              },
            },
            { $sort: { startsAt: 1, key: 1 } },
          ])
          .toArray()
      );

      res.status(200).json({ message: distinctTasks });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
