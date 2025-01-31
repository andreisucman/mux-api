import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { skip } = aqp(req.query as any) as AqpQuery;

    try {
      const pastFollowers = await doWithRetries(async () =>
        db
          .collection("FollowHistory")
          .find(
            { userId: new ObjectId(req.userId) },
            { projection: { followingUserName: 1, avatar: 1 } }
          )
          .sort({ updatedAt: -1 })
          .skip(skip || 0)
          .limit(21)
          .toArray()
      );

      if (pastFollowers.length === 0) {
        res.status(200).json({ message: [] });
        return;
      }

      res.status(200).json({ message: pastFollowers });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
