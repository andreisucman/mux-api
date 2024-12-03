import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import getLatestRoutineAndTasks from "functions/getLatestRoutineAndTasks.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { taskIds, newStatus } = req.body;

  try {
    await doWithRetries({
      functionName: "updateStatusOfTasks",
      functionToExecute: async () =>
        db.collection("Task").updateMany(
          {
            _id: { $in: taskIds.map((id: string) => new ObjectId(id)) },
            userId: new ObjectId(req.userId),
          },
          { $set: { status: newStatus } }
        ),
    });

    const response = await getLatestRoutineAndTasks({ userId: req.userId });

    res.status(200).json({ message: response });
  } catch (error) {
    addErrorLog({
      functionName: "updateStatusOfTasks",
      message: error.message,
    });
  }
});

export default route;
