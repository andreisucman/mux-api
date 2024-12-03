import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const rewards = await doWithRetries(async () =>
        db.collection("Review").find().sort({ createdAt: -1 }).toArray()
      );

      res.status(200).json({ message: rewards });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
