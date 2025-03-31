import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, RoutineStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const routinePartObjects = await doWithRetries(
        async () =>
          await db
            .collection("Routine")
            .aggregate([
              {
                $match: {
                  userId: new ObjectId(req.userId),
                  status: {
                    $nin: [
                      RoutineStatusEnum.DELETED,
                      RoutineStatusEnum.CANCELED,
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: "$part",
                },
              },
              { $project: { _id: 1 } },
            ])
            .toArray()
      );

      const routineData = await doWithRetries(async () =>
        db
          .collection("RoutineData")
          .find({ userId: new ObjectId(req.userId) })
          .toArray()
      );

      res
        .status(200)
        .json({
          message: {
            parts: routinePartObjects.map((o) => o._id),
            routineData,
          },
        });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
