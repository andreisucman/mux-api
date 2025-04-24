import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { isValidYouTubeEmbedUrl } from "helpers/utils.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { taskId, exampleVideoId } = req.body;

  if (!ObjectId.isValid(taskId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const url = `https://www.youtube.com/embed/${exampleVideoId}`;
    const isValidId = await isValidYouTubeEmbedUrl(url);

    if (!isValidId) {
      res.status(200).json({ error: "Invalid video id" });
      return;
    }

    const example = {
      type: "video",
      url: url,
    };

    await doWithRetries(() =>
      db.collection("Task").updateOne({ _id: new ObjectId(taskId) }, { $push: { examples: example } as any })
    );

    res.status(200).end();
  } catch (err) {
    next(err);
  }
});

export default route;
