import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { PurchaseType } from "@/types/getBuyersType.js";
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
        name: 1,
        paid: 1,
        part: 1,
        isSubscribed: 1,
      };

      if (type === "seller") {
        projection.buyerAvatar = 1;
        projection.buyerName = 1;
      } else {
        projection.sellerAvatar = 1;
        projection.sellerName = 1;
      }

      const purchases = (await doWithRetries(async () =>
        db
          .collection("Purchase")
          .find(
            {
              buyerId: new ObjectId(req.userId),
            },
            {
              projection,
            }
          )
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
