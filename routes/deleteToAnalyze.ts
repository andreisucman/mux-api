import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { userId, url } = req.body;

  if (!userId || !url) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({ userId, projection: { toAnalyze: 1 } });
    const updatedToAnalyze = userInfo.toAnalyze.filter((obj) => obj.mainUrl.url !== url);
    await doWithRetries(() =>
      db.collection("User").updateOne({ _id: new ObjectId(userId) }, { $set: { toAnalyze: updatedToAnalyze } })
    );
    res.status(200).json({ message: updatedToAnalyze });
  } catch (err) {
    next(err);
  }
});

export default route;
