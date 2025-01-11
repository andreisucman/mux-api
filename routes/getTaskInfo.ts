import { ObjectId } from "mongodb";
import { Router, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get("/:taskId", async (req: CustomRequest, res, next: NextFunction) => {
  const { taskId } = req.params;

  if (!taskId || !ObjectId.isValid(taskId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const taskInfo = await doWithRetries(async () =>
      db.collection("Task").findOne({ _id: new ObjectId(taskId as string) })
    );

    res.status(200).json({ message: taskInfo });
  } catch (err) {
    next(err);
  }
});

export default route;
