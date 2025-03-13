import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { status, part, name, description, oneTimePrice, subscriptionPrice } =
      req.body;

    if (
      Number(oneTimePrice) < 1 ||
      Number(subscriptionPrice) < 1 ||
      isNaN(Number(oneTimePrice)) ||
      isNaN(Number(subscriptionPrice))
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      await doWithRetries(async () =>
        db.collection("RoutineData").updateOne(
          { userId: new ObjectId(req.userId), part },
          {
            $set: {
              status,
              name,
              description,
              oneTimePrice,
              subscriptionPrice,
            },
          },
          { upsert: true }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
