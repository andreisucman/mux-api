import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response } from "express";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import { CustomRequest } from "types.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response) => {
  try {
    const rewards = await doWithRetries({
      functionName: "getRewards",
      functionToExecute: async () =>
        db
          .collection("Reward")
          .find(
            { isActive: true },
            {
              projection: {
                _id: 1,
                rewards: 0,
              },
            }
          )
          .sort({ startsAt: 1 })
          .toArray(),
    });

    res.status(200).json({ message: rewards });
  } catch (error) {
    addErrorLog({ functionName: "getRewards", message: error.message });
  }
});

export default route;
