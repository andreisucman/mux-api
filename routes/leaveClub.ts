import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import removeFromClub from "functions/removeFromClub.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { name: 1 },
      });

      const { name } = userInfo;
      await removeFromClub({ userId: req.userId });
      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
