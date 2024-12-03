import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import {
  CustomRequest,
  RequiredSubmissionType,
  TaskStatusEnum,
  TaskType,
} from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { taskId, submissionId, isSubmitted } = req.body;

  try {
    const taskInfo = (await doWithRetries({
      functionName: "updateRequiredSubmission - find",
      functionToExecute: async () =>
        db.collection("Task").findOne(
          { _id: new ObjectId(taskId), userId: new ObjectId(req.userId) },
          {
            projection: {
              requiredSubmissions: 1,
              userId: 1,
              key: 1,
              routineId: 1,
              proofEnabled: 1,
            },
          }
        ),
    })) as unknown as TaskType;

    if (!taskInfo) throw new Error(`Task ${taskId} not found`);

    const { proofEnabled, requiredSubmissions, routineId, key } = taskInfo;

    const relevantSubmission: RequiredSubmissionType = requiredSubmissions.find(
      (s) => s.submissionId === submissionId
    );

    if ((proofEnabled && isSubmitted) || relevantSubmission.proofId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    let updatedSubmissions = [...requiredSubmissions];

    const relevantIndex = requiredSubmissions.findIndex(
      (submission) => submission.submissionId === submissionId
    );

    const updatedSubmission = { ...relevantSubmission, isSubmitted };
    updatedSubmissions.splice(relevantIndex, 1, updatedSubmission);

    const payload: Partial<TaskType> = {
      requiredSubmissions: updatedSubmissions,
    };

    if (!isSubmitted) payload.status = "active" as TaskStatusEnum; // if reset

    await doWithRetries({
      functionName: "updateRequiredSubmission",
      functionToExecute: async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(routineId), "allTasks.key": key },
          {
            $inc: {
              [`allTasks.$.completed`]: isSubmitted ? -1 : 1,
              [`allTasks.$.unknown`]: isSubmitted ? 1 : -1,
            },
          }
        ),
    });

    const allCompleted = updatedSubmissions.every(
      (s) => s.isSubmitted === true
    );

    if (allCompleted) payload.status = "completed" as TaskStatusEnum;

    await doWithRetries({
      functionName: "updateRequiredSubmission - update",
      functionToExecute: async () =>
        db.collection("Task").updateOne(
          { _id: new ObjectId(taskId) },
          {
            $set: payload,
          }
        ),
    });

    res.status(200).json({
      message: {
        status: payload.status,
        requiredSubmissions: updatedSubmissions,
      },
    });
  } catch (error) {
    addErrorLog({
      functionName: "updateRequiredSubmission",
      message: error.message,
    });
  }
});

export default route;
