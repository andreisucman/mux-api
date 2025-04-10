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
  routineIds: string[];
  startDate: string;
  ignoreIncompleteTasks?: boolean;
};

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { routineIds, startDate, ignoreIncompleteTasks }: Props = req.body;

  const { isValidDate, isFutureDate } = checkDateValidity(startDate, req.timeZone);

  if (!routineIds || !isValidDate || !isFutureDate) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { name: 1 },
    });

    if (!userInfo) throw httpError(`User ${req.userId} not found`);

    const routinesToAdd = (await doWithRetries(async () =>
      db
        .collection("Routine")
        .find({
          _id: { $in: routineIds.map((id: string) => new ObjectId(id)) },
        })
        .toArray()
    )) as unknown as RoutineType[];

    if (!routinesToAdd.length) throw httpError(`Routines ${routineIds.join(", ")} not found`);

    const targetUserId = routinesToAdd[0].userId;
    const routineParts = routinesToAdd.map((r) => r.part);
    const uniqueRoutineParts = [...new Set(routineParts)];

    const hasAccessTo = await checkPurchaseAccess({
      parts: uniqueRoutineParts,
      targetUserId: String(targetUserId),
      userId: req.userId,
    });

    if (!hasAccessTo.length) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const accessibleRoutines = routinesToAdd
      .filter((r) => hasAccessTo.includes(r.part))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    const batchSize = 5;
    let promises = [];
    let clonedRoutines = [];

    const daysDifference = calculateDaysDifference(new Date(accessibleRoutines[0].startsAt), new Date(startDate));

    for (let i = 0; i < accessibleRoutines.length; i++) {
      promises.push(
        doWithRetries(() =>
          copySingleRoutine({
            hostRoutine: accessibleRoutines[i],
            userId: req.userId,
            userName: userInfo.name,
            ignoreIncompleteTasks,
            daysDifference,
          })
        )
      );

      if (promises.length === batchSize) {
        const result = await doWithRetries(async () => await Promise.all(promises));
        clonedRoutines.push(...result);
        promises.length = 0;
      }
    }

    if (promises.length > 0) {
      const result = await doWithRetries(async () => await Promise.all(promises));
      clonedRoutines.push(...result);
      promises.length = 0;
    }

    res.status(200).json({ message: clonedRoutines });
  } catch (error) {
    next(error);
  }
});

export default route;
