import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";
import deactivateHangingBaAndRoutineData from "@/functions/deactivateHangingBaAndRoutineData.js";
import deleteRoutine from "@/functions/deleteRoutine.js";

const route = Router();

type Props = {
  timeZone: string;
  routineIds: string[];
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { routineIds, timeZone }: Props = req.body;

    if (!routineIds || !timeZone) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const batchSize = 5;
      let promises = [];

      for (let i = 0; i < routineIds.length; i++) {
        promises.push(
          doWithRetries(() =>
            deleteRoutine({
              routineId: routineIds[i],
            })
          )
        );

        if (promises.length === batchSize) {
          await doWithRetries(async () => await Promise.all(promises));
          promises.length = 0;
        }
      }

      if (promises.length > 0) {
        await doWithRetries(async () => await Promise.all(promises));
        promises.length = 0;
      }

      await deactivateHangingBaAndRoutineData({
        routineIds,
        userId: req.userId,
      });

      const updatedRoutines = await doWithRetries(() =>
        db
          .collection("Routine")
          .find({
            _id: { $in: routineIds.map((id) => new ObjectId(id)) },
            userId: new ObjectId(req.userId),
            deletedOn: { $exists: false },
          })
          .toArray()
      );

      res.status(200).json({ message: updatedRoutines });
    } catch (error) {
      next(error);
    }
  }
);

export default route;
