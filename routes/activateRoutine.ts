import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, RoutineStatusEnum, TaskStatusEnum } from "types.js";
import { db } from "init.js";
import { setToUtcMidnight } from "@/helpers/utils.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
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

      const currentRoutine = await doWithRetries(async () =>
        db
          .collection("Routine")
          .find(
            {
              userId: new ObjectId(req.userId),
              status: RoutineStatusEnum.ACTIVE,
              part: newRoutine.part,
            },
            { projection: { part: 1, createdAt: 1 } }
          )
          .sort({ createdAt: -1 })
          .next()
      );

      if (newRoutine) {
        const { modifiedCount } = await doWithRetries(async () =>
          db.collection("Task").updateMany(
            {
              routineId: new ObjectId(routineId),
              status: {
                $in: [TaskStatusEnum.INACTIVE, TaskStatusEnum.EXPIRED],
              },
              expiresAt: { $gt: setToUtcMidnight(new Date()) },
            },
            { $set: { status: RoutineStatusEnum.ACTIVE } }
          )
        );

        if (modifiedCount === 0) {
          res.status(200).json({ error: "This routine can't be reactivated." });
          return;
        }

        const response = await doWithRetries(async () =>
          db
            .collection("Routine")
            .updateOne(
              { _id: new ObjectId(routineId) },
              { $set: { status: RoutineStatusEnum.ACTIVE } }
            )
        );
      }

      if (currentRoutine) {
        // deactivate currently active routine
        const reponse = await doWithRetries(async () =>
          db.collection("Routine").updateOne(
            {
              _id: new ObjectId(currentRoutine._id),
            },
            { $set: { status: RoutineStatusEnum.INACTIVE } }
          )
        );

        const taskResponse = await doWithRetries(async () =>
          db.collection("Task").updateMany(
            {
              routineId: new ObjectId(currentRoutine._id),
            },
            { $set: { status: TaskStatusEnum.INACTIVE } }
          )
        );
      }

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
