import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import findLatestRewards from "@/functions/findLatestRewards.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const rewards = await findLatestRewards({ userId: req.userId });
      res.status(200).json({ message: rewards });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
