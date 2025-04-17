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
import copySingleRoutine from "@/functions/copySingleRoutine.js";
import checkPurchaseAccess from "@/functions/checkPurchaseAccess.js";

const route = Router();

type Props = {
  routineId: string;
  startDate: string;
  ignoreIncompleteTasks?: boolean;
};

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { routineId, startDate, ignoreIncompleteTasks }: Props = req.body;

  const { isValidDate, isFutureDate } = checkDateValidity(startDate, req.timeZone);

  if (!routineId || !isValidDate || !isFutureDate) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { name: 1 },
    });

    if (!userInfo) throw httpError(`User ${req.userId} not found`);

    const routineToAdd = (await doWithRetries(async () =>
      db.collection("Routine").findOne({
        _id: new ObjectId(routineId),
      })
    )) as unknown as RoutineType;

    if (!routineToAdd) throw httpError(`Routine ${routineId} not found`);

    const accessObject = await checkPurchaseAccess({
      parts: [routineToAdd.part],
      concerns: routineToAdd.concerns,
      targetUserId: String(routineToAdd.userId),
      userId: req.userId,
    });

    const hasAccess = accessObject.parts.length > 0 && accessObject.concerns.length > 0;

    if (!hasAccess) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const daysDifference = calculateDaysDifference(new Date(routineToAdd.startsAt), new Date(startDate));

    const clonedRoutine = await doWithRetries(() =>
      copySingleRoutine({
        hostRoutine: routineToAdd,
        userId: req.userId,
        userName: userInfo.name,
        ignoreIncompleteTasks,
        daysDifference,
      })
    );

    res.status(200).json({ message: [clonedRoutine] });
  } catch (error) {
    next(error);
  }
});

export default route;
