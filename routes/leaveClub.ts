import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import removeFromClub from "functions/removeFromClub.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      await removeFromClub(req.userId);
      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
