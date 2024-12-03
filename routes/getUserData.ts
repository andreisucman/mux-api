import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import getUserData from "functions/getUserData.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userData = await doWithRetries(
        async () => await getUserData({ userId: req.userId })
      );

      res.status(200).json({ message: userData });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
