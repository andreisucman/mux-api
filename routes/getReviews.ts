import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response) => {
  try {
    const rewards = await doWithRetries({
      functionName: "getReviews - get tasks",
      functionToExecute: async () =>
        db.collection("Review").find().sort({ createdAt: -1 }).toArray(),
    });

    res.status(200).json({ message: rewards });
  } catch (error) {
    addErrorLog({ functionName: "getReviews", message: error.message });
  }
});

export default route;
