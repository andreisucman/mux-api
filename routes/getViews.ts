import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, PartEnum } from "types.js";
import { ObjectId, Sort } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

const route = Router();

export type ViewRecordType = {
  userId: ObjectId;
  part: PartEnum;
  concern: string;
  updatedAt: Date;
  views: number;
  earned: number;
};

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip, sort } = aqp(req.query as any) as AqpQuery;

    try {
      const filter: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
      };

      const viewRecords = await doWithRetries(() =>
        db
          .collection("View")
          .find(filter)
          .skip(skip || 0)
          .sort((sort || { views: -1 }) as Sort)
          .toArray()
      );

      res.status(200).json({ message: viewRecords });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
