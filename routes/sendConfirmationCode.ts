import * as dotenv from "dotenv";
dotenv.config();
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      await sendConfirmationCode({ userId: req.userId });
      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
