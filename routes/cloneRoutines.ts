import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, RoutineStatusEnum, RoutineType } from "types.js";
import { checkDateValidity } from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import cloneSingleRoutine from "@/functions/cloneSingleRoutine.js";
import getLatestRoutinesAndTasks from "@/functions/getLatestRoutineAndTasks.js";

const route = Router();

type Props = {
  routineIds: string[];
  startDate: string;
  timeZone: string;
  part?: string;
  sort?: string;
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { routineIds, startDate, timeZone }: Props = req.body;

    const { isValidDate, isFutureDate } = checkDateValidity(
      startDate,
      timeZone
    );

    if (!routineIds || !isValidDate || !isFutureDate) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { timeZone: 1, name: 1 },
      });

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      const { timeZone } = userInfo;

      const routinesToAdd = (await doWithRetries(async () =>
        db
          .collection("Routine")
          .find({
            _id: { $in: routineIds.map((id: string) => new ObjectId(id)) },
          })
          .toArray()
      )) as unknown as RoutineType[];

      if (!routinesToAdd.length)
        throw httpError(`Routines ${routineIds.join(", ")} not found`);

      const batchSize = 5;
      let promises = [];
      let clonedRoutines = [];

      for (let i = 0; i < routinesToAdd.length; i++) {
        promises.push(
          doWithRetries(() =>
            cloneSingleRoutine({
              hostRoutine: routinesToAdd[i],
              startDate,
              timeZone,
              userId: req.userId,
              userName: userInfo.name,
            })
          )
        );

        if (promises.length === batchSize) {
          const result = await doWithRetries(
            async () => await Promise.all(promises)
          );
          clonedRoutines.push(...result);
          promises.length = 0;
        }
      }

      if (promises.length > 0) {
        const result = await doWithRetries(
          async () => await Promise.all(promises)
        );
        clonedRoutines.push(...result);
        promises.length = 0;
      }

      res.status(200).json({ message: clonedRoutines });
    } catch (error) {
      next(error);
    }
  }
);

export default route;
