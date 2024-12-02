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
  const { taskId } = req.body;

  try {
    const taskInfo = await doWithRetries({
      functionName: "getTaskProducts",
      functionToExecute: async () =>
        db.collection("Task").findOne(
          { _id: new ObjectId(taskId) },
          {
            projection: {
              key: 1,
              name: 1,
              icon: 1,
              color: 1,
              startsAt: 1,
              suggestions: 1,
              defaultSuggestions: 1,
              productsPersonalized: 1,
            },
          }
        ),
    });

    res.status(200).json({ message: taskInfo });
  } catch (error) {
    addErrorLog({ functionName: "getTaskProducts", message: error.message });
  }
});

export default route;
