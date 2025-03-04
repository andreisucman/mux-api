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

      console.log("connectWebhook req.body", req.body);
      console.log("signature", signature);
      console.log(
        "process.env.STRIPE_WEBHOOK_SECRET_ACCOUNT",
        process.env.STRIPE_WEBHOOK_SECRET_ACCOUNT
      );

      const event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET_CONNECT
      );
      handleConnectWebhook(event);
      res.status(200).send();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
