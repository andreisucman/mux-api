import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import createRoutine from "@/functions/createRoutine.js";
import checkSubscriptionStatus from "functions/checkSubscription.js";
import { CustomRequest, SubscriptionTypeNamesEnum, ModerationStatusEnum, CategoryNameEnum } from "types.js";
import updateNextRoutine from "helpers/updateNextRoutine.js";
import formatDate from "helpers/formatDate.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import checkCanRoutine from "@/helpers/checkCanRoutine.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import { db } from "init.js";
import { validParts } from "@/data/other.js";
import { checkDateValidity, delayExecution } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { part, creationMode = "scratch", routineStartDate, specialConsiderations } = req.body;

  console.log("req.timeZone", req.timeZone);

  if (!part || (part && !validParts.includes(part))) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  const { isValidDate, isFutureDate } = checkDateValidity(routineStartDate, req.timeZone);

  console.log("routineStartDate", routineStartDate);

  if (!isValidDate || !isFutureDate) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const subscriptionIsValid: boolean = await checkSubscriptionStatus({
      userId: req.userId,
      subscriptionType: SubscriptionTypeNamesEnum.IMPROVEMENT,
    });

    if (!subscriptionIsValid) {
      res.status(200).json({ error: "subscription expired" });
      return;
    }

    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { nextRoutine: 1, concerns: 1 },
    });

    if (!userInfo) throw httpError("User not found");

    const { nextRoutine, concerns: existingConcerns = [] } = userInfo;

    const partConcerns = existingConcerns.filter((co) => co.part === part);

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(req.userId), operationKey: "routine" },
          { $set: { isRunning: true, progress: 1, isError: false } },
          { upsert: true }
        )
    );

    global.startInterval(
      () =>
        incrementProgress({
          operationKey: "routine",
          userId: req.userId,
          value: 1,
        }),
      12000
    );

    res.status(200).end();

    let { canRoutineDate, availableRoutines } = await checkCanRoutine({
      nextRoutine,
      userId: req.userId,
    });

    availableRoutines = availableRoutines.filter((r) => r.part === part);

    if (availableRoutines.length === 0) {
      const formattedDate = formatDate({
        date: new Date(canRoutineDate),
        hideYear: true,
      });

      addAnalysisStatusError({
        message: `You can create a routine once a week only. Try again after ${formattedDate}.`,
        operationKey: "routine",
        userId: req.userId,
      });
      return;
    }

    const promises = availableRoutines.map((r) =>
      doWithRetries(
        async () =>
          await createRoutine({
            userId: req.userId,
            part: r.part,
            creationMode,
            incrementMultiplier: 5 - availableRoutines.length,
            partConcerns,
            specialConsiderations,
            categoryName: CategoryNameEnum.TASKS,
            routineStartDate,
          })
      )
    );

    await Promise.all(promises);

    const updatedNextRoutine = updateNextRoutine({
      nextRoutine,
      parts: availableRoutines.map((r) => r.part),
    });

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(req.userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        {
          $set: {
            nextRoutine: updatedNextRoutine,
          },
        }
      )
    );

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne({ userId: new ObjectId(req.userId), operationKey: "routine" }, { $set: { progress: 99 } })
    );

    await delayExecution(5000);

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(req.userId), operationKey: "routine" },
          { $set: { isRunning: false, progress: 99 } }
        )
    );
    global.stopInterval();
  } catch (err) {
    await addAnalysisStatusError({
      operationKey: "routine",
      userId: String(req.userId),
      message: "An unexpected error occured. Please try again and inform us if the error persists.",
      originalMessage: err.message,
    });
    global.stopInterval();
    next(err);
  }
});

export default route;
