import * as dotenv from "dotenv";
dotenv.config();

import { Router, NextFunction } from "express";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post("/", async (req, res, next: NextFunction) => {
  const { url } = req.body;

  try {
    const response = await doWithRetries(() =>
      fetch(`${process.env.PROCESSING_SERVER_URL}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: process.env.PROCESSING_SECRET,
        },
        body: JSON.stringify({ audioFile: url }),
      })
    );

    const body = await response.json();

    if (!response.ok) {
      throw httpError(body.message);
    }

    res.status(200).json({ message: body.message });
  } catch (err) {
    next(err);
  }
});

export default route;
