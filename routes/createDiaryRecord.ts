import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, TaskStatusEnum } from "types.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import { DiaryType } from "@/types/saveDiaryRecordTypes.js";
import { ModerationStatusEnum } from "types.js";
import { daysFrom } from "@/helpers/utils.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { part, concern } = req.body;

  if (!part || !concern) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const usersTodayMidnight = setToMidnight({ date: new Date(), timeZone: req.timeZone });

    const todayAdded = await doWithRetries(async () =>
      db
        .collection("Diary")
        .find({ userId: new ObjectId(req.userId), createdAt: { $gte: usersTodayMidnight }, part, concern })
        .toArray()
    );

    if (todayAdded) {
      const addedCount = todayAdded.flatMap((rec) => rec.audio).length;
      if (addedCount > 9) {
        res.status(200).json({ error: "No more than 10 records per day." });
        return;
      }
    }

    const todaysDiaryRecord = (await doWithRetries(async () =>
      db.collection("Diary").findOne({
        userId: new ObjectId(req.userId),
        part,
        concern,
        createdAt: { $gte: usersTodayMidnight },
        moderationStatus: ModerationStatusEnum.ACTIVE,
        deletedOn: { $exists: false },
      })
    )) as unknown as DiaryType;

    let result: any = null;

    if (todaysDiaryRecord) {
      result = todaysDiaryRecord;
    } else {
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
            concern,
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
          error: `You haven't completed any ${part} - ${concern} tasks today.`,
        });
        return;
      }

      const proofFilters: { [key: string]: any } = {
        userId: new ObjectId(req.userId),
        part,
        concern,
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

      result = {
        _id: "temp",
        userId: new ObjectId(req.userId),
        part,
        concern,
        audio: [],
        transcriptions: [],
        createdAt: new Date(),
        activity: todaysProof.map((p) => ({
          contentId: p._id,
          taskId: p.taskId,
          name: p.taskName,
          url: p.mainUrl.url,
          thumbnail: p.contentType === "video" ? p.mainThumbnail.url : "",
          icon: p.icon,
          contentType: p.contentType,
          concern: p.concern,
        })),
      };
    }

    res.status(200).json({ message: result });
  } catch (err) {
    next(err);
  }
});

export default route;
