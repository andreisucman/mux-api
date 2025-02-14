import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import checkIfUserExists from "@/functions/checkIfUserExists.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userId, sex } = req.body;

    if (
      !userId ||
      !ObjectId.isValid(userId) ||
      !["male", "female", null].includes(sex)
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const isRegistered = await checkIfUserExists({
        filter: { _id: new ObjectId(userId), email: { $ne: "" } },
        projection: { _id: 1 },
      });

      if (isRegistered) {
        if (!req.userId) {
          res.status(400).json({ error: "Bad request" });
          return;
        }

        if (req.userId !== String(isRegistered._id)) {
          res.status(400).json({ error: "Bad request" });
          return;
        }
      }

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
            email: "",
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
