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
import { db } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { concerns, type, part, specialConsiderations } = req.body;

    console.log("createRountine route inputs", req.body);

    if (!concerns || !type) {
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
        projection: { nextRoutine: 1, nextScan: 1, concerns: 1 },
      });

      if (!userInfo) throw httpError("User not found");

      const {
        nextRoutine,
        nextScan,
        concerns: existingConcerns = [],
      } = userInfo;

      console.log("createRountine userInfo", userInfo);

      console.log("createRountine nextRoutine", nextRoutine);

      const relevantTypeRoutine = nextRoutine.find((obj) => obj.type === type);

      console.log("createRountine relevantTypeRoutine", relevantTypeRoutine);

      const cooldown = new Date() < new Date(relevantTypeRoutine.date);

      if (cooldown) {
        const formattedDate = formatDate({
          date: new Date(relevantTypeRoutine.date),
          hideYear: true,
        });
        res.status(200).json({
          error: `You can generate a routine once a week only. Try again after ${formattedDate}.`,
        });
        return;
      }

      let selectedConcerns = concerns.filter(
        (c: UserConcernType) => c.type === type && !c?.isDisabled
      );

      if (part) {
        selectedConcerns = selectedConcerns.filter(
          (c: UserConcernType) => c.part === part
        );
      }

      if (selectedConcerns.length === 0) {
        // if the user disables all concerns
        res.status(400).json({ error: "Bad request" });
        return;
      }

      console.log("createRountine selectedConcerns", selectedConcerns);

      const selectedConcernKeys = selectedConcerns.map(
        (c: UserConcernType) => c.name
      );

      const restOfConcerns = existingConcerns.filter(
        (c: UserConcernType) => !selectedConcernKeys.includes(c.name)
      );

      const allUniqueConcerns = [...restOfConcerns, ...selectedConcerns].filter(
        (obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i
      );

      res.status(200).end();

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(req.userId), operationKey: type },
            { $set: { isRunning: true, progress: 1, isError: false } },
            { upsert: true }
          )
      );

      let updatedNextRoutine;

      if (part) {
        await createRoutine({
          type,
          part,
          userId: req.userId,
          partConcerns: selectedConcerns,
          specialConsiderations,
          categoryName: CategoryNameEnum.TASKS,
        });

        updatedNextRoutine = updateNextRoutine({
          nextRoutine,
          parts: [part],
          type,
        });
      } else {
        /* get the analyzed parts of the user */
        const relevantScan = nextScan.find((obj) => obj.type === type);
        const relevantParts = relevantScan.parts.filter((obj) =>
          Boolean(obj.date)
        );
        const scannedPartsKeys = relevantParts.map((obj) => obj.part);

        const promises = scannedPartsKeys.map((partKey) =>
          doWithRetries(
            async () =>
              await createRoutine({
                type,
                userId: req.userId,
                part: partKey,
                partConcerns: selectedConcerns,
                specialConsiderations,
                categoryName: CategoryNameEnum.TASKS,
              })
          )
        );

        await Promise.all(promises);

        updatedNextRoutine = updateNextRoutine({
          nextRoutine,
          parts: scannedPartsKeys,
          type,
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
            { userId: new ObjectId(req.userId), operationKey: type },
            { $set: { isRunning: false, progress: 99 } }
          )
      );
    } catch (err) {
      next(err);
    }
  }
);

export default route;
