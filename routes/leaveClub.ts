import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import removeFromClub from "functions/removeFromClub.js";
import getUserInfo from "@/functions/getUserInfo.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      await removeFromClub({ userId: req.userId });
      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
