import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, proofEnabled } = req.body;

    try {
      const taskInfo = await doWithRetries(async () =>
        db
          .collection("Task")
          .findOne(
            { _id: new ObjectId(taskId), userId: new ObjectId(req.userId) },
            { projection: { userId: 1 } }
          )
      );

      if (!taskInfo) throw httpError(`Task ${taskId} not found`);

      await doWithRetries(async () =>
        db
          .collection("Task")
          .updateOne({ _id: new ObjectId(taskId) }, { $set: { proofEnabled } })
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
