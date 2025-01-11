import * as dotenv from "dotenv";
dotenv.config();
import express, { Router, Request, Response, NextFunction } from "express";
import handleConnectWebhook from "functions/handleConnectWebhook.js";
import httpError from "@/helpers/httpError.js";
import { stripe } from "init.js";

const route = Router();

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
      handleConnectWebhook(event);
      res.status(200).send();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
