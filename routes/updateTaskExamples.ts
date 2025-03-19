import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, example } = req.body;

    if (!ObjectId.isValid(taskId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const taskInfo = await doWithRetries(() =>
        db
          .collection("Task")
          .findOne(
            { _id: new ObjectId(taskId) },
            { projection: { routineId: 1, key: 1 } }
          )
      );

      if (!taskInfo) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      await doWithRetries(() =>
        db.collection("Task").updateMany(
          {
            routineId: new ObjectId(taskInfo.routineId),
            key: taskInfo.key,
          },
          { $set: { example } }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
