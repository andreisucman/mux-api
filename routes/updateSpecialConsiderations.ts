import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { text } = req.body;

    if (typeof text !== "string") {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $set: { specialConsiderations: text.slice(0, 300) } }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
