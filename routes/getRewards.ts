import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const rewards = await doWithRetries(async () =>
        db
          .collection("Reward")
          .find(
            { isActive: true },
            {
              projection: {
                _id: 1,
                rewards: 0,
              },
            }
          )
          .sort({ startsAt: 1 })
          .toArray()
      );

      res.status(200).json({ message: rewards });
    } catch (err) {
      next(httpError(err.message, err.status));
    }
  }
);

export default route;
