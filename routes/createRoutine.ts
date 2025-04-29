import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, ModerationStatusEnum, CategoryNameEnum } from "types.js";
import updateNextRun from "helpers/updateNextRun.js";
import formatDate from "helpers/formatDate.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import checkCanAction from "@/helpers/checkCanAction.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import { db } from "init.js";
import { validParts } from "@/data/other.js";
import { checkDateValidity, delayExecution } from "@/helpers/utils.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import updateRoutineDataStats from "@/functions/updateRoutineDataStats.js";
import makeANewRoutine from "@/functions/makeANewRoutine.js";
import { CreateRoutineUserInfoType } from "@/types/createRoutineTypes.js";
import { RoutineSuggestionType } from "@/types/updateRoutineSuggestionTypes.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { part, routineStartDate } = req.body;

  if (!part || (part && !validParts.includes(part))) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  const { isValidDate, isFutureDate } = checkDateValidity(routineStartDate, req.timeZone);

  if (!isValidDate || !isFutureDate) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = (await getUserInfo({
      userId: req.userId,
      projection: { nextRoutine: 1, concerns: 1, name: 1, timeZone: 1 },
    })) as CreateRoutineUserInfoType;

    if (!userInfo) throw httpError("User not found");

    const { nextRoutine, concerns: existingConcerns = [] } = userInfo;

    const partConcerns = existingConcerns.filter((co) => co.part === part);

    const analysisAlreadyStarted = await doWithRetries(async () =>
      db.collection("AnalysisStatus").countDocuments({
        userId: new ObjectId(req.userId),
        operationKey: "routine",
        isRunning: true,
      })
    );

    if (analysisAlreadyStarted > 0) {
      res.status(400).json({
        error: "Bad request",
      });
      return;
    }

    const { checkBackDate, isActionAvailable } = await checkCanAction({
      nextAction: [nextRoutine],
      part,
    });

    if (!isActionAvailable) {
      const formattedDate = formatDate({
        date: new Date(checkBackDate),
        hideYear: true,
      });

      addAnalysisStatusError({
        message: `You can create a routine once a week only. Try again after ${formattedDate}.`,
        operationKey: "routine",
        userId: req.userId,
      });
      return;
    }

    const latestSuggestion = (await doWithRetries(() =>
      db
        .collection("RoutineSuggestion")
        .find(
          {
            userId: new ObjectId(req.userId),
            part,
          },
          { projection: { tasks: 1 } }
        )
        .sort({ createdAt: -1 })
        .next()
    )) as unknown as RoutineSuggestionType | null;

    if (!latestSuggestion || !latestSuggestion.tasks) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    res.status(200).end();

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(req.userId), operationKey: "routine" },
          { $set: { isRunning: true, progress: 1, isError: false, createdAt: new Date() } },
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
      5000
    );

    await makeANewRoutine({
      part,
      userId: req.userId,
      userInfo,
      partConcerns,
      routineStartDate,
      categoryName: CategoryNameEnum.TASKS,
      suggestedTasks: latestSuggestion.tasks,
    });

    const updatedNextRoutine = updateNextRun({
      nextRun: [nextRoutine],
      parts: [part],
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
          { $set: { isRunning: false, progress: 0 }, $unset: { createdAt: null } }
        )
    );

    updateRoutineDataStats({ userId: req.userId, part, concerns: partConcerns.map((c) => c.name) });

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
