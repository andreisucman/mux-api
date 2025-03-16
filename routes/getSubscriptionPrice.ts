import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { CustomRequest } from "types.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { sellerId, part } = req.query;

    try {
      const priceObject = await doWithRetries(() =>
        db
          .collection("RoutineData")
          .findOne({ userId: new ObjectId(sellerId as string), part })
      );

      res.status(200).json({ message: priceObject.updatePrice });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
