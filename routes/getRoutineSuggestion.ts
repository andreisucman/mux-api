import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get("/:part", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { part } = req.params;
  try {
    const latestSuggestion = await doWithRetries(() =>
      db
        .collection("RoutineSuggestion")
        .find({
          userId: new ObjectId(req.userId),
          part,
        })
        .sort({ createdAt: -1 })
        .next()
    );

    res.status(200).json({ message: latestSuggestion });
  } catch (err) {
    next(err);
  }
});

export default route;
