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
import getUserInfo from "@/functions/getUserInfo.js";
import cancelRoutineSubscribers from "@/functions/cancelRoutineSubscribers.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { status, concern, name, description, price, updatePrice } = req.body;

  if (
    Number(price) < 5 ||
    Number(updatePrice) < 2 ||
    isNaN(Number(price)) ||
    isNaN(Number(updatePrice)) ||
    !concern ||
    name.length > 50 ||
    description.length > 2000
  ) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { "club.payouts.payoutsEnabled": 1 },
    });

    if (!userInfo.club) {
      res.status(400).json({ error: "Bad request" });
    }

    const updatePayload: { [key: string]: any } = {
      status,
      name,
      description,
      price,
      updatePrice,
    };

    if (status === "public") {
      // if (!userInfo.club.payouts.payoutsEnabled) {
      //   res.status(200).json({
      //     error: "You can't publish a routine while your payouts are disabled.",
      //   });
      //   return;
      // }
      // const { passed, message } = await checkPublishingRequirements({ userId: req.userId, concern });
      // if (!passed) {
      //   res.status(200).json({
      //     error: message,
      //   });
      //   return;
      // }
    }

    for (const text of [name, description]) {
      const isSafe = await checkTextSafety({
        userId: req.userId,
        text,
        collection: SuspiciousRecordCollectionEnum.ROUTINE_DATA,
      });

      if (!isSafe) {
        res.status(200).json({
          error: "It appears that your text contains profanity. Please revise and try again.",
        });
        return;
      }
    }

    const existingRecord = await doWithRetries(async () =>
      db.collection("RoutineData").findOne({ userId: new ObjectId(req.userId), concern })
    );

    if (existingRecord) {
      await doWithRetries(async () =>
        db.collection("RoutineData").updateOne(
          { _id: existingRecord._id },
          {
            $set: updatePayload,
          }
        )
      );
    } else {
      const firstRoutineOfConcern = await doWithRetries(async () =>
        db
          .collection("Routine")
          .find({ userId: new ObjectId(req.userId), concerns: { $in: [concern] } })
          .sort({ createdAt: 1 })
          .next()
      );

      updatePayload.contentStartDate = firstRoutineOfConcern.createdAt;

      await doWithRetries(async () =>
        db.collection("RoutineData").updateOne(
          { userId: new ObjectId(req.userId), concern },
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

    await doWithRetries(async () =>
      db.collection("BeforeAfter").updateOne(
        { userId: new ObjectId(req.userId), concern },
        {
          $set: { routineName: name },
        }
      )
    );

    const payload: { [key: string]: any } = {
      isPublic: status === "public",
      avatar,
      userName,
    };

    await updateContent({
      collections: ["BeforeAfter", "Progress", "Proof"],
      updatePayload: payload,
      filter: {
        userId: new ObjectId(req.userId),
        concern,
      },
    });

    await updateContent({
      collections: ["Routine", "Diary"],
      updatePayload: payload,
      filter: {
        userId: new ObjectId(req.userId),
        concerns: { $in: [concern] },
      },
    });

    await doWithRetries(() =>
      db.collection("User").updateOne({ _id: new ObjectId(req.userId) }, { $set: { isPublic: status === "public" } })
    );

    if (status !== "public") {
      await cancelRoutineSubscribers({ sellerId: new ObjectId(req.userId) });
    }
  } catch (err) {
    next(err);
  }
});

export default route;
