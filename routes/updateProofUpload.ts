import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { taskId, proofEnabled } = req.body;

  try {
    const task = await doWithRetries({
      functionName: "proofEnabled - find",
      functionToExecute: async () =>
        db
          .collection("Task")
          .findOne(
            { _id: new ObjectId(taskId) },
            { projection: { userId: 1 } }
          ),
    });

    if (String(task.userId) !== String(req.userId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    await doWithRetries({
      functionName: "proofEnabled - update",
      functionToExecute: async () =>
        db
          .collection("Task")
          .updateOne({ _id: new ObjectId(taskId) }, { $set: { proofEnabled } }),
    });

    res.status(200).end();
  } catch (error) {
    addErrorLog({ functionName: "proofEnabled", message: error.message });
  }
});

export default route;
