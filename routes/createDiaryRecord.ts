import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, TaskStatusEnum } from "types.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import { DiaryActivityType } from "@/types/saveDiaryRecordTypes.js";
import { ModerationStatusEnum } from "types.js";
import { daysFrom } from "@/helpers/utils.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { part } = req.body;

  try {
    const usersTodayMidnight = setToMidnight({ date: new Date(), timeZone: req.timeZone });

    const todaysDiaryRecords = await doWithRetries(async () =>
      db.collection("Diary").findOne({
        part,
        createdAt: { $gt: usersTodayMidnight },
        moderationStatus: ModerationStatusEnum.ACTIVE,
      })
    );

    if (todaysDiaryRecords) {
      res.status(200).json({
        error: "You've already added a diary note for today. Come back tomorrow.",
      });
      return;
    }

    const usersTomorrowMidnight = setToMidnight({
      date: daysFrom({ days: 1 }),
      timeZone: req.timeZone,
    });

    const anyCompleted = await doWithRetries(async () =>
      db.collection("Task").findOne(
        {
          userId: new ObjectId(req.userId),
          completedAt: {
            $gte: usersTodayMidnight,
            $lt: usersTomorrowMidnight,
          },
          status: TaskStatusEnum.COMPLETED,
          part,
        },
        {
          projection: {
            _id: 1,
          },
        }
      )
    );

    if (!anyCompleted) {
      res.status(200).json({
        error: `You haven't completed any ${part} tasks today.`,
      });
      return;
    }

    const results: DiaryActivityType[] = [];

    const proofFilters: { [key: string]: any } = {
      userId: new ObjectId(req.userId),
      part,
      createdAt: { $gte: usersTodayMidnight, $lt: usersTomorrowMidnight },
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    const todaysProof = await doWithRetries(async () =>
      db
        .collection("Proof")
        .find(proofFilters, {
          projection: {
            contentType: 1,
            taskName: 1,
            mainUrl: 1,
            mainThumbnail: 1,
            icon: 1,
            part: 1,
            concern: 1,
            taskId: 1,
          },
        })
        .sort({ _id: -1 })
        .toArray()
    );

    for (const proof of todaysProof) {
      results.unshift({
        contentId: proof._id,
        taskId: proof.taskId,
        name: proof.taskName,
        url: proof.mainUrl.url,
        thumbnail: proof.contentType === "video" ? proof.mainThumbnail.url : "",
        icon: proof.icon,
        contentType: proof.contentType,
        concern: proof.concern,
      });
    }

    res.status(200).json({ message: results });
  } catch (err) {
    next(err);
  }
});

export default route;
