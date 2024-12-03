import { ObjectId } from "mongodb";
import { Router } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import addErrorLog from "functions/addErrorLog.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/:taskId", async (req: CustomRequest, res) => {
  const { taskId } = req.params;

  try {
    const taskInfo = await doWithRetries({
      functionName: "getTaskInfo",
      functionToExecute: async () =>
        db.collection("Task").findOne({ _id: new ObjectId(taskId as string) }),
    });

    res.status(200).json({ message: taskInfo });
  } catch (error) {
    addErrorLog({
      functionName: "getTaskInfo",
      message: error.message,
    });
    res.status(500).json({ error: "Unexpected error" });
  }
});

export default route;
