import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, RoutineType } from "types.js";
import { calculateDaysDifference, checkDateValidity } from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import rescheduleSingleRoutine from "@/functions/rescheduleSingleRoutine.js";
import getLatestRoutinesAndTasks from "@/functions/getLatestRoutineAndTasks.js";

const route = Router();

type Props = {
  routineIds: string[];
  startDate: string;
  timeZone: string;
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

      const routinesToReschedule = (await doWithRetries(async () =>
        db
          .collection("Routine")
          .find(
            {
              _id: { $in: routineIds.map((id: string) => new ObjectId(id)) },
              userId: new ObjectId(req.userId),
            },
            { projection: { finalSchedule: 0, concerns: 0 } }
          )
          .toArray()
      )) as unknown as RoutineType[];

      if (!routinesToReschedule.length)
        throw httpError(`Routines ${routineIds.join(", ")} not found`);

      const batchSize = 5;
      let promises = [];

      const startDates = routinesToReschedule.map((r) =>
        Math.round(r.startsAt.getTime())
      );

      const earliestDate = new Date(Math.min(...startDates));
      const daysOffset = calculateDaysDifference(
        earliestDate,
        new Date(startDate)
      );

      for (let i = 0; i < routinesToReschedule.length; i++) {
        promises.push(
          doWithRetries(() =>
            rescheduleSingleRoutine({
              daysOffset,
              routine: routinesToReschedule[i],
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

      const updatedRoutines = await doWithRetries(() =>
        db
          .collection("Routine")
          .find({
            _id: { $in: routineIds.map((id) => new ObjectId(id)) },
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
