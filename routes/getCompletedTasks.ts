import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response) => {
  const { skip, type } = req.query;

  try {
    const payload: { [key: string]: any } = {
      userId: new ObjectId(req.userId),
      status: "completed",
    };

    if (type) payload.type = type;

    const completedTasks = await doWithRetries({
      functionName: "getCompletedTasks",
      functionToExecute: async () =>
        db
          .collection("Task")
          .find(payload, {
            projection: {
              _id: 1,
              name: 1,
              key: 1,
              icon: 1,
              color: 1,
              type: 1,
              description: 1,
              completedAt: 1,
            },
          })
          .skip(Number(skip) || 0)
          .toArray(),
    });

    res.status(200).json({ message: completedTasks });
  } catch (error) {
    addErrorLog({ functionName: "getCompletedTasks", message: error.message });
  }
});

export default route;
