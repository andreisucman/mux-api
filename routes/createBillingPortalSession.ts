import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import { stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { stripeUserId: 1 },
      });

      const { stripeUserId } = userInfo;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeUserId,
        return_url: `${process.env.CLIENT_URL}/settings`,
      });

      res.status(200).json({ message: portalSession.url });
    } catch (err) {
      next(httpError(err.message, err.status));
    }
  }
);

export default route;
