import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, RoutineStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const routineConcernNameObjects = await doWithRetries(
      async () =>
        (await db
          .collection("Routine")
          .aggregate([
            {
              $match: {
                userId: new ObjectId(req.userId),
                status: {
                  $ne: RoutineStatusEnum.CANCELED,
                },
                deletedOn: { $exists: false },
              },
            },
            { $unwind: "$concerns" },
            {
              $group: {
                _id: null,
                concerns: { $addToSet: "$concerns" },
                parts: { $addToSet: "$part" },
              },
            },
            { $project: { _id: 0, concerns: 1, parts: 1 } },
          ])
          .next()) || { concerns: [], parts: [] }
    );

    const routineData = await doWithRetries(async () =>
      db
        .collection("RoutineData")
        .find({ userId: new ObjectId(req.userId) })
        .toArray()
    );

    res.status(200).json({
      message: {
        concerns: routineConcernNameObjects.concerns,
        parts: routineConcernNameObjects.parts,
        routineData,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
