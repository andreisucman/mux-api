import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { daysFrom } from "helpers/utils.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { isActivate } = req.body;

  try {
    const payload: { [key: string]: any } = {};

    if (isActivate) {
      payload.deleteOn = null;
      payload.isPublic = true;
    } else {
      const partsAvailable = await doWithRetries(async () =>
        db
          .collection("Routine")
          .aggregate([
            {
              $match: {
                _id: new ObjectId(req.userId),
              },
            },
            {
              $group: {
                _id: "$part",
              },
            },
            {
              $project: {
                _id: 0,
                part: "$_id",
              },
            },
          ])
          .toArray()
      );
      const isAnythingSold = await doWithRetries(() =>
        db.collection("Purchase").countDocuments({
          part: { $in: partsAvailable.map((p) => p.part) },
          sellerId: new ObjectId(req.userId),
        })
      );
      const days = isAnythingSold ? 365 : 7;
      const deleteOn = daysFrom({ days });
      payload.deleteOn = deleteOn;
      payload.isPublic = false;
    }

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(req.userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        { $set: payload }
      )
    );

    res.status(200).json({ message: payload.deleteOn });
  } catch (err) {
    next(err);
  }
});

export default route;
