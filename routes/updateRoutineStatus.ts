import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, RoutineStatusEnum } from "types.js";
import updateRoutineStatus from "@/functions/updateRoutineStatus.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";
import deactivateHangingBaAndRoutineData from "@/functions/deactivateHangingBaAndRoutineData.js";

const route = Router();

type Props = {
  routineId: string;
  newStatus: "active" | "canceled";
};

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { routineId, newStatus }: Props = req.body;

  if (!routineId) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  if (!["active", "deleted", "canceled"].includes(newStatus)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    await doWithRetries(() =>
      updateRoutineStatus({
        newStatus: newStatus as RoutineStatusEnum,
        routineId,
      })
    );

    if (newStatus === RoutineStatusEnum.CANCELED) {
      await deactivateHangingBaAndRoutineData({
        routineIds: [routineId],
        userId: req.userId,
      });
    }

    const updatedRoutines = await doWithRetries(() =>
      db
        .collection("Routine")
        .find({
          _id: new ObjectId(routineId),
          userId: new ObjectId(req.userId),
          deletedOn: { $exists: false },
        })
        .toArray()
    );

    res.status(200).json({ message: updatedRoutines });
  } catch (error) {
    next(error);
  }
});

export default route;
