import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import createRoutine from "functions/createRoutine.js";
import checkSubscriptionStatus from "functions/checkSubscription.js";
import {
  UserConcernType,
  CustomRequest,
  SubscriptionTypeNamesEnum,
  ModerationStatusEnum,
  CategoryNameEnum,
} from "types.js";
import updateNextRoutine from "helpers/updateNextRoutine.js";
import formatDate from "helpers/formatDate.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "@/functions/getUserInfo.js";
import checkCanRoutine from "@/helpers/checkCanRoutine.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const {
      concerns,
      part,
      routineStartDate = new Date(),
      specialConsiderations,
    } = req.body;

    if (!concerns) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const activeConcerns = concerns.filter(
        (c: UserConcernType) => !c.isDisabled
      );

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
        projection: { nextRoutine: 1, nextScan: 1, concerns: 1 },
      });

      if (!userInfo) throw httpError("User not found");

      const {
        nextRoutine,
        nextScan,
        concerns: existingConcerns = [],
      } = userInfo;

      if (concerns.length === 0) {
        // if the user disables all concerns
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const selectedConcernKeys = activeConcerns.map(
        (c: UserConcernType) => c.name
      );

      const restOfConcerns = existingConcerns.filter(
        (c: UserConcernType) =>
          !selectedConcernKeys.includes(c.name) && !c.isDisabled
      );

      const allUniqueConcerns = [...restOfConcerns, ...concerns].filter(
        (obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i
      );

      res.status(200).end();

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(req.userId), operationKey: "routine" },
            { $set: { isRunning: true, progress: 1, isError: false } },
            { upsert: true }
          )
      );

      let updatedNextRoutine;

      if (part) {
        const relevantRoutine = nextRoutine.find((r) => r.part === part);
        const isInCooldown = new Date(relevantRoutine.date) > new Date();

        if (isInCooldown) {
          const formattedDate = formatDate({
            date: new Date(relevantRoutine.date),
          });
          addAnalysisStatusError({
            message: `You can create a routine once a week only. Try again after ${formattedDate}.`,
            operationKey: "routine",
            userId: req.userId,
          });
          return;
        }

        await createRoutine({
          part,
          userId: req.userId,
          concerns: activeConcerns,
          specialConsiderations,
          categoryName: CategoryNameEnum.TASKS,
        });

        updatedNextRoutine = updateNextRoutine({
          nextRoutine,
          parts: [part],
        });
      } else {
        /* to prevent cases when the user creates all routines and routines for not analyzed parts are created too */
        const { canRoutine, availableRoutines, canRoutineDate } =
          checkCanRoutine({
            nextScan,
            nextRoutine,
          });

        if (!canRoutine) {
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

        const promises = availableRoutines.map((partKey) =>
          doWithRetries(
            async () =>
              await createRoutine({
                userId: req.userId,
                part: partKey,
                concerns: activeConcerns,
                specialConsiderations,
                categoryName: CategoryNameEnum.TASKS,
              })
          )
        );

        await Promise.all(promises);

        updatedNextRoutine = updateNextRoutine({
          nextRoutine,
          parts: availableRoutines,
        });
      }

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            $set: {
              nextRoutine: updatedNextRoutine,
              concerns: allUniqueConcerns,
            },
          }
        )
      );

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(req.userId), operationKey: "routine" },
            { $set: { isRunning: false, progress: 99 } }
          )
      );
    } catch (err) {
      next(err);
    }
  }
);

export default route;
