import * as dotenv from "dotenv";
dotenv.config();
import express, { Router, Request, Response } from "express";
import handleConnectWebhook from "functions/handleConnectWebhook.js";
import { stripe } from "init.js";

const route = Router();

route.post(
  "/",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).end("Method Not Allowed");
      return;
    }

    const signature = req.headers["stripe-signature"];

    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    try {
      handleConnectWebhook(event);
    } catch (err) {
      console.log(`Stripe webhook signature verification failed.`, err.message);
      res.sendStatus(400);
      return;
    }

    res.status(200).send();
  }
);

export default route;
