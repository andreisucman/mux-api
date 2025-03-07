import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, RoutineType } from "types.js";
import { checkDateValidity } from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import stealSingleRoutine from "@/functions/stealSingleRoutine.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";

const route = Router();

type Props = { routineIds: string[]; startDate: string; userName: string };

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { routineIds, startDate, userName }: Props = req.body;

    const { isValidDate, isFutureDate } = checkDateValidity(startDate);

    if (!routineIds || !isValidDate || !isFutureDate || !userName) {
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
          .find(
            { _id: { $in: routineIds.map((id: string) => new ObjectId(id)) } },
            { projection: { _id: 0 } }
          )
          .toArray()
      )) as unknown as RoutineType[];

      if (!routinesToAdd)
        throw httpError(`Routines ${routinesToAdd.join(", ")} not found`);

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(req.userId), operationKey: "routine" },
            { $set: { isRunning: true, progress: 1, isError: false } },
            { upsert: true }
          )
      );

      res.status(200).end();

      const batchSize = 5;
      let promises = [];

      for (let i = 0; i < routinesToAdd.length; i++) {
        promises.push(
          doWithRetries(() =>
            stealSingleRoutine({
              hostRoutine: routinesToAdd[i],
              startDate,
              timeZone,
              userId: req.userId,
              userName: userInfo.name,
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
    } catch (error) {
      await addAnalysisStatusError({
        userId: String(req.userId),
        message: "An unexpected error occured. Please try again.",
        originalMessage: error.message,
        operationKey: "routine",
      });
      next(error);
    }
  }
);

export default route;
