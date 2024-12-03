import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import { CustomRequest } from "types.js";
import { daysFrom } from "helpers/utils.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { isActivate } = req.body;
  try {
    const payload: { [key: string]: any } = {};

    if (isActivate) {
      payload.deleteOn = null;
    } else {
      const deleteOn = daysFrom({ days: 30 });
      payload.deleteOn = deleteOn;
    }
    payload.club = { isActive: isActivate };

    await doWithRetries({
      functionName: "updateAccountDeletion",
      functionToExecute: async () =>
        db
          .collection("User")
          .updateOne({ _id: new ObjectId(req.userId) }, { $set: payload }),
    });

    res.status(200).json({ deleteOn: payload.deleteOn });
  } catch (error) {
    addErrorLog({
      functionName: "updateAccountDeletion",
      message: error.message,
    });
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default route;
