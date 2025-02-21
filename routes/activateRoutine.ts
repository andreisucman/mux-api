import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, RoutineStatusEnum } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { routineId } = req.body;

    try {
      const newRoutine = await doWithRetries(async () =>
        db
          .collection("Routine")
          .findOne(
            { _id: new ObjectId(routineId), userId: new ObjectId(req.userId) },
            { projection: { part: 1 } }
          )
      );

      if (!newRoutine)
        throw httpError(`No routine ${routineId} at user ${req.userId}`);

      // deactivate currently active routine
      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          {
            userId: new ObjectId(req.userId),
            status: RoutineStatusEnum.ACTIVE,
            part: newRoutine.part,
          },
          { $set: { status: RoutineStatusEnum.INACTIVE } }
        )
      );

      await doWithRetries(async () =>
        db
          .collection("Routine")
          .updateOne(
            { _id: new ObjectId(routineId) },
            { $set: { status: RoutineStatusEnum.ACTIVE } }
          )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
