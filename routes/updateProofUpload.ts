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
    const taskInfo = await doWithRetries({
      functionName: "updateProofUpload - find",
      functionToExecute: async () =>
        db
          .collection("Task")
          .findOne(
            { _id: new ObjectId(taskId), userId: new ObjectId(req.userId) },
            { projection: { userId: 1 } }
          ),
    });

    if (!taskInfo) throw new Error(`Task ${taskId} not found`);

    await doWithRetries({
      functionName: "updateProofUpload - update",
      functionToExecute: async () =>
        db
          .collection("Task")
          .updateOne({ _id: new ObjectId(taskId) }, { $set: { proofEnabled } }),
    });

    res.status(200).end();
  } catch (error) {
    addErrorLog({ functionName: "updateProofUpload", message: error.message });
  }
});

export default route;
