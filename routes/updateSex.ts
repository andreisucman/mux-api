import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userId, sex } = req.body;

    if (
      !userId ||
      !ObjectId.isValid(userId) ||
      !["male", "female"].includes(sex)
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
            email: { $exists: false },
          },
          { $set: { "demographics.sex": sex } }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
