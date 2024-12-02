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
  const { text } = req.body;

  if (typeof text !== "string") {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    await doWithRetries({
      functionName: "updateSpecialConsiderations",
      functionToExecute: async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(req.userId) },
            { $set: { specialConsiderations: text.slice(0, 300) } }
          ),
    });

    res.status(200).end();
  } catch (error) {
    addErrorLog({
      functionName: "updateSpecialConsiderations",
      message: error.message,
    });
  }
});

export default route;
