import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:trackedUserId?/:type?",
  async (req: CustomRequest, res: Response) => {
    const { trackedUserId, type } = req.params;
    const { skip } = req.query;

    try {
      if (!type) return;
      if (!trackedUserId || !ObjectId.isValid(trackedUserId)) return;

      const userInfo = await doWithRetries({
        functionName: "checkTrackedRBAC - isCorrectTracker",
        functionToExecute: async () =>
          db
            .collection("User")
            .findOne(
              { _id: new ObjectId(trackedUserId) },
              { projection: { subscriptions: 1 } }
            ),
      });

      if (!userInfo) throw new Error("User not found");

      const { peek } = userInfo.subscriptions || {};

      if (!peek?.validUntil || new Date() > new Date(peek.validUntil)) {
        res.status(200).json({
          error: "subscription expired",
        });

        return;
      }

      await checkTrackedRBAC({
        userId: req.userId,
        trackedUserId,
        userProjection: { subsciptions: 1 },
      });

      const routines = await doWithRetries({
        functionName: "getTrackedRoutines",
        functionToExecute: async () =>
          db
            .collection("Routine")
            .find({ userId: new ObjectId(trackedUserId), type })
            .sort({ createdAt: -1 })
            .skip(Number(skip) || 0)
            .limit(9)
            .toArray(),
      });

      res.status(200).json({
        message: routines,
      });
    } catch (error) {
      addErrorLog({
        functionName: "getTrackedRoutines",
        message: error.message,
      });
      res.status(500).json({ error: "Server error" });
    }
  }
);

export default route;
