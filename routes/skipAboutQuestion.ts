import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { questionId, isSkipped } = req.body;

    if (!ObjectId.isValid(questionId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      await doWithRetries(async () =>
        db
          .collection("FaqAnswer")
          .updateOne(
            { _id: new ObjectId(questionId), userId: new ObjectId(req.userId) },
            { $set: { skipped: isSkipped } }
          )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
