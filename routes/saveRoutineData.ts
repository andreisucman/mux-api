import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkTextSafety from "@/functions/checkTextSafety.js";
import { SuspiciousRecordCollectionEnum } from "@/functions/addSuspiciousRecord.js";
import updateContent from "@/functions/updateContent.js";
import cancelSubscription from "@/functions/cancelSubscription.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { status, part, name, description, price, updatePrice } = req.body;

    if (
      Number(price) < 1 ||
      Number(updatePrice) < 1 ||
      isNaN(Number(price)) ||
      isNaN(Number(updatePrice)) ||
      name.length > 50 ||
      description.length > 150
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const updatePayload: { [key: string]: any } = {
        status,
        name,
        description,
        price,
        updatePrice,
      };

      for (const text of [name, description]) {
        const isSafe = await checkTextSafety({
          userId: req.userId,
          text,
          collection: SuspiciousRecordCollectionEnum.ROUTINE_DATA,
        });

        if (!isSafe) {
          res.status(200).json({
            error:
              "It appears that your text contains profanity. Please revise and try again.",
          });
          return;
        }
      }

      const existingRecord = await doWithRetries(async () =>
        db
          .collection("RoutineData")
          .findOne({ userId: new ObjectId(req.userId), part })
      );

      if (existingRecord) {
        await doWithRetries(async () =>
          db.collection("RoutineData").updateOne(
            { userId: new ObjectId(req.userId), part },
            {
              $set: updatePayload,
            }
          )
        );
      } else {
        const firstRoutineOfPart = await doWithRetries(async () =>
          db
            .collection("Routine")
            .findOne(
              { userId: new ObjectId(req.userId), part },
              { sort: { createdAt: 1 } }
            )
        );

        updatePayload.contentStartDate = firstRoutineOfPart.createdAt;

        await doWithRetries(async () =>
          db.collection("RoutineData").updateOne(
            { userId: new ObjectId(req.userId), part },
            {
              $set: updatePayload,
            },
            { upsert: true }
          )
        );
      }

      res.status(200).end();

      const { name: userName, avatar } =
        (await getUserInfo({
          userId: req.userId,
          projection: { name: 1, avatar: 1 },
        })) || {};

      await updateContent({
        userId: req.userId,
        collections: ["BeforeAfter", "Progress", "Proof", "Diary", "Routine"],
        updatePayload: {
          isPublic: status === "public",
          avatar,
          userName,
        },
        part,
      });

      if (status !== "public") {
        const subscribers = await doWithRetries(() =>
          db
            .collection("Purchase")
            .find(
              {
                sellerId: new ObjectId(req.userId),
                subscriptionId: { $exists: true },
              },
              { projection: { subscriptionId: 1 } }
            )
            .toArray()
        );

        for (const subscription of subscribers) {
          await cancelSubscription({
            subscriptionId: subscription.subscriptionId,
          });
        }
      }
    } catch (err) {
      next(err);
    }
  }
);

export default route;
