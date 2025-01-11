import * as dotenv from "dotenv";
dotenv.config();
import express, { NextFunction, Request, Response } from "express";
import handleStripeWebhook from "functions/handleStripeWebhook/index.js";
import { stripe } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = express.Router();

route.post(
  "/",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.method !== "POST") {
        throw httpError("Method not allowed", 405);
      }

      const signature = req.headers["stripe-signature"];

      const event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      handleStripeWebhook(event);

      res.status(200).send();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
