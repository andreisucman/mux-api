import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { PurchaseType } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip, type } = req.query;

    try {
      const projection: { [key: string]: any } = {
        paid: 1,
        part: 1,
        subscriptionId: 1,
        contentEndDate: 1,
        isDeactivated: 1,
      };

      const filter: { [key: string]: any } = {};

      if (type === "seller") {
        filter.sellerId = new ObjectId(req.userId);
        projection.buyerAvatar = 1;
        projection.buyerName = 1;
      } else {
        filter.buyerId = new ObjectId(req.userId);
        projection.sellerAvatar = 1;
        projection.sellerName = 1;
        projection.sellerId = 1;
      }

      const purchases = (await doWithRetries(async () =>
        db
          .collection("Purchase")
          .find(filter, {
            projection,
          })
          .limit(21)
          .skip(Number(skip) || 0)
          .toArray()
      )) as unknown as PurchaseType[];

      res.status(200).json({ message: purchases });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
