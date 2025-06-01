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
  const { userId } = req.query;

  const finalUserId = req.userId || userId as string;
  
  try {
    const latestSuggestion = await doWithRetries(() =>
      db
        .collection("RoutineSuggestion")
        .find({
          userId: new ObjectId(finalUserId),
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
