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
import publishBeforeAfter from "@/functions/publishBeforeAfter.js";
import checkPublishingRequirements from "@/functions/checkRoutineDataPublishingRequirements.js";
import { getStatsForRoutineData } from "@/functions/updateRoutineDataStats.js";

export type RoutineDataStatsType = {
  routines: number;
  completedTasks: number;
  completedTasksWithProof: number;
  diaryRecords: number;
};

export type RoutineDataType = {
  concern: string;
  part: string;
  name: string;
  status: string;
  description: string;
  price: number;
  updatePrice: number;
  stats?: RoutineDataStatsType;
};

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { status, concern, part, name, description, price, updatePrice } = req.body;

  if (
    Number(price) < 5 ||
    Number(updatePrice) < 2 ||
    isNaN(Number(price)) ||
    isNaN(Number(updatePrice)) ||
    !concern ||
    !part ||
    name.length > 50 ||
    description.length > 2000
  ) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { "club.payouts.payoutsEnabled": 1, name: 1 },
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
      userName: userInfo.name,
    };

    const existingRecord = await doWithRetries(async () =>
      db.collection("RoutineData").findOne({ userId: new ObjectId(req.userId), concern, part })
    );

    if (status === "public") {
      if (!userInfo.club.payouts.payoutsEnabled) {
        res.status(200).json({
          error: "You can't publish a routine while your payouts are disabled.",
        });
        return;
      }
      const { passed, message } = await checkPublishingRequirements({
        userId: req.userId,
        part,
        concern,
      });
      if (!passed) {
        res.status(200).json({
          error: message,
        });
        return;
      }
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
      const stats = await getStatsForRoutineData({
        concerns: [concern],
        part,
        userId: req.userId,
      });

      updatePayload.stats = stats;

      const firstRoutineOfConcern = await doWithRetries(async () =>
        db
          .collection("Routine")
          .find({ userId: new ObjectId(req.userId), concerns: { $in: [concern] }, part })
          .sort({ createdAt: 1 })
          .next()
      );

      updatePayload.contentStartDate = firstRoutineOfConcern.createdAt;

      const concernBeforeAfterCount = await doWithRetries(() =>
        db.collection("BeforeAfter").countDocuments({ userId: new ObjectId(req.userId), concern, part })
      );

      if (concernBeforeAfterCount === 0) {
        const { name: userName, avatar } =
          (await getUserInfo({
            userId: req.userId,
            projection: { name: 1, avatar: 1 },
          })) || {};

        publishBeforeAfter({
          firstRoutineStartDate: firstRoutineOfConcern.createdAt,
          userId: req.userId,
          userName,
          avatar,
          concern,
          part,
          isPublic: status === "public",
          routineName: name,
        });
      }

      await doWithRetries(async () =>
        db.collection("RoutineData").updateOne(
          { userId: new ObjectId(req.userId), concern, part },
          {
            $set: updatePayload,
          },
          { upsert: true }
        )
      );
    }

    res.status(200).end();

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
    };

    await updateContent({
      collections: ["BeforeAfter", "Progress", "Proof", "Diary"],
      updatePayload: payload,
      filter: {
        userId: new ObjectId(req.userId),
        concern,
      },
    });

    await updateContent({
      collections: ["Routine"],
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
      await cancelRoutineSubscribers({ sellerId: new ObjectId(req.userId), part, concern });
    }
  } catch (err) {
    next(err);
  }
});

export default route;
