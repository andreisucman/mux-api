import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { type } = req.query;

    try {
      const filters: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
      };

      if (type) filters.type = type;

      const diary = await doWithRetries(async () =>
        db.collection("Diary").find(filters).sort({ createdAt: -1 }).toArray()
      );

      res.status(200).json({ message: diary });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
