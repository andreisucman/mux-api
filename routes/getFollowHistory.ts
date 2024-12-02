import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp from "api-query-params";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response) => {
  const { skip } = aqp(req.query);

  try {
    const pastFollowers = await doWithRetries({
      functionName: "getFollowHistory",
      functionToExecute: async () =>
        db
          .collection("FollowHistory")
          .find(
            { userId: new ObjectId(req.userId) },
            { projection: { trackedUserId: 1, avatar: 1, name: 1 } }
          )
          .sort({ updatedAt: -1 })
          .skip(skip || 0)
          .limit(7)
          .toArray(),
    });

    if (pastFollowers.length === 0) {
      res.status(200).json({ message: [] });
      return;
    }

    res.status(200).json({ message: pastFollowers });
  } catch (error) {
    addErrorLog({
      functionName: "getFollowHistory",
      message: error.message,
    });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
