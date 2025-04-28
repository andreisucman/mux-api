import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CategoryNameEnum, CustomRequest, TaskType } from "types.js";
import generateImage from "@/functions/generateImage.js";
import searchYoutubeVideos from "@/functions/searchYoutubeVideos.js";
import { db } from "init.js";
import setToMidnight from "@/helpers/setToMidnight.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskId } = req.body;

  if (!ObjectId.isValid(taskId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    let examples = [];

    const taskInfo = (await doWithRetries(() =>
      db.collection("Task").findOne({ _id: new ObjectId(taskId) })
    )) as unknown as TaskType;

    const now = setToMidnight({ date: new Date(), timeZone: req.timeZone });

    if (taskInfo.startsAt > now || taskInfo.expiresAt < now) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    if (taskInfo.isFood) {
      const dishImage = await generateImage({
        description: taskInfo.description,
        categoryName: CategoryNameEnum.TASKS,
        userId: req.userId,
      });

      const example = { type: "image", url: dishImage };
      examples = [example];
      taskInfo.examples = examples;
    } else {
      const youtubeVideos = await searchYoutubeVideos(`How to ${taskInfo.name}`);

      if (youtubeVideos) {
        examples = youtubeVideos.map((url: string) => ({
          type: "video",
          url,
        }));
      } else {
        examples = null;
      }
    }

    await doWithRetries(() => db.collection("Task").updateOne({ _id: new ObjectId(taskId) }, { $set: { examples } }));

    res.status(200).json({ message: examples });
  } catch (err) {
    next(err);
  }
});

export default route;
