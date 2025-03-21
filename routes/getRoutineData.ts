import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const routines = await doWithRetries(
        async () =>
          await db
            .collection("Routine")
            .aggregate([
              {
                $group: {
                  _id: "$part",
                  doc: { $first: "$$ROOT" },
                },
              },
              { $replaceRoot: { newRoot: "$doc" } },
            ])
            .toArray()
      );

      const routineData = await doWithRetries(async () =>
        db
          .collection("RoutineData")
          .find({ userId: new ObjectId(req.userId) })
          .toArray()
      );

      res.status(200).json({ message: { routines, routineData } });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
